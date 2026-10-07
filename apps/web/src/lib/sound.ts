let ctx: AudioContext | null = null;
const enabled = () => localStorage.getItem('noochi.sound') !== 'off';

function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, durMs: number, atMs = 0, gain = 0.055, type: OscillatorType = 'sine') {
  const c = ac();
  if (!c || !enabled()) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + atMs / 1000;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

export const sounds = {
  send: () => { tone(600, 90); tone(880, 70, 50); },
  receive: () => { tone(520, 110); tone(760, 130, 70); },
  click: () => tone(420, 40, 0, 0.03),
  open: () => tone(500, 60, 0, 0.04),
  chime: () => { tone(660, 220); tone(880, 220, 110); tone(1100, 320, 220); },
  error: () => tone(200, 250, 0, 0.05, 'triangle'),
  setEnabled: (v: boolean) => localStorage.setItem('noochi.sound', v ? 'on' : 'off'),
  isEnabled: enabled,
};

// ---- lo-fi radio ----
/** One station, served from several mirror hosts; some mirrors refuse browsers, so playback walks
 *  the list until one of them starts streaming. */
export const RADIO_STATION_NAME = 'Indie Pop';
const HOSTS = ['ice2', 'ice5', 'ice6', 'ice1'] as const;
const streamUrl = (host: number) => `https://${HOSTS[host % HOSTS.length]}.somafm.com/indiepop-128-mp3`;

export type RadioStatus = 'idle' | 'loading' | 'playing' | 'error';

let audio: HTMLAudioElement | null = null;
/** bumped on every (re)start so a superseded attempt can't rewrite the state it was replaced by */
let attempt = 0;
type RadioCb = (playing: boolean, volume: number, status: RadioStatus) => void;
const radioListeners = new Set<RadioCb>();

const state = {
  playing: false,
  status: 'idle' as RadioStatus,
  volume: Number(localStorage.getItem('noochi.radio.vol') ?? 0.35),
};

function emit() { for (const cb of radioListeners) cb(state.playing, state.volume, state.status); }

function el(): HTMLAudioElement {
  audio ??= new Audio();
  audio.addEventListener('error', () => {
    if (state.status === 'playing') { state.playing = false; state.status = 'error'; emit(); }
  });
  return audio;
}

function silence() {
  attempt++;
  audio?.pause();
}

function start(hostIdx: number) {
  const my = ++attempt;
  const a = el();
  a.src = streamUrl(hostIdx);
  a.volume = state.volume;
  a.loop = false;
  state.playing = false;
  state.status = 'loading';
  emit();
  a.play().then(() => {
    if (my !== attempt) return;
    state.playing = true;
    state.status = 'playing';
    emit();
  }).catch(() => {
    if (my !== attempt) return;
    if (hostIdx + 1 < HOSTS.length) start(hostIdx + 1);
    else { state.playing = false; state.status = 'error'; emit(); }
  });
}

export const radio = {
  toggle() { state.playing ? radio.stop() : radio.play(); },
  play() { silence(); start(0); },
  stop() { silence(); state.playing = false; state.status = 'idle'; emit(); },
  setVolume(v: number) {
    state.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem('noochi.radio.vol', String(state.volume));
    if (audio) audio.volume = state.volume;
    emit();
  },
  get playing() { return state.playing; },
  get status() { return state.status; },
  get volume() { return state.volume; },
  subscribe(cb: RadioCb) { radioListeners.add(cb); return () => { radioListeners.delete(cb); }; },
};
