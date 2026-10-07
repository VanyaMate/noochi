// Structural check for п.8: what actually reaches the model, and does the mood rotate?
import { buildCharacterSystemPrompt, TURN_FLAVORS, pickTurnFlavor } from '../packages/prompts/src/index.js';
import type { Character } from '@noochi/shared';

const paul = {
  name: 'Paul', tagline: 'French bakery guy, very small English', level: 'A1',
  persona: 'Paul is 24 and works in his uncle\'s bakery in Lyon.',
  interests: ['baking', 'croissants'], style: 'very short sentences, hands gestures in words',
  formality: 'casual', extraPrompt: '',
} as unknown as Character;

const built = buildCharacterSystemPrompt(paul, { flavor: pickTurnFlavor() });
console.log('system prompt chars:', built.length);
console.log('has anti-formula rule:', /NO FORMULA/.test(built));
console.log('question is rare:', /Asking is the RARE move/.test(built));
console.log('no emoji reuse rule:', /do not reuse their first word/.test(built));
console.log('mood block present:', /# Mood for this one reply/.test(built));
console.log('mood line:', built.split('# Mood for this one reply\n')[1]?.split('\n')[0]);
console.log('flavors:', TURN_FLAVORS.length);
const seen = new Set(Array.from({ length: 40 }, () => pickTurnFlavor()));
console.log('distinct flavors drawn in 40 picks:', seen.size);
console.log('output format line:', /# Output format\n(.+)/.exec(built)?.[1]);
