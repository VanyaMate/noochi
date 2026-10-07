import { useEffect, useState } from 'react';
import { RADIO_STATION_NAME, radio, sounds } from '../lib/sound';
import { useT } from '../lib/i18n';

export function RadioBar() {
  const t = useT();
  const [, setTick] = useState(0);
  const [soundOn, setSoundOn] = useState(sounds.isEnabled());

  useEffect(() => radio.subscribe(() => setTick((x) => x + 1)), []);

  return (
    <div className="mb-2 rounded-xl border border-latte bg-parchment/80 p-2 shadow-soft">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => { radio.toggle(); }}
          title={t('radio_hint')}
          className="grid h-8 w-8 place-items-center rounded-full bg-terra text-parchment transition hover:scale-105 hover:bg-terraDeep active:scale-95"
        >
          {radio.playing ? '⏸' : '▶'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-cocoaSoft">
            lo-fi · {RADIO_STATION_NAME}
            {radio.status === 'loading' && <span className="font-semibold text-cocoaSoft/70"> · {t('radio_loading')}</span>}
            {radio.status === 'error' && <span className="font-semibold text-ember"> · {t('radio_error')}</span>}
          </div>
          {radio.playing && (
            <div className="flex items-end gap-0.5 pt-0.5" aria-hidden>
              {[3, 6, 4, 7, 5].map((h, i) => (
                <span key={i} className="w-0.5 rounded bg-honey" style={{ height: h + 2, animation: `blink ${0.9 + i * 0.17}s infinite` }} />
              ))}
            </div>
          )}
        </div>
      </div>
      <input
        type="range" min={0} max={1} step={0.02} value={radio.volume}
        onChange={(e) => radio.setVolume(Number(e.target.value))}
        className="mt-1 h-1 w-full accent-terraDeep"
      />
      <button
        onClick={() => { const v = !soundOn; sounds.setEnabled(v); setSoundOn(v); if (v) sounds.click(); }}
        className="mt-1 w-full rounded-lg py-0.5 text-[11px] font-bold text-cocoaSoft/80 hover:bg-latte/70"
      >
        {soundOn ? '🔔 ' + t('sound_on') : '🔕 ' + t('sound_off')}
      </button>
    </div>
  );
}
