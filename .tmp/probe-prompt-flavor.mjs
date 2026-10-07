// Sends a few messages as the demo user and prints the character replies, so the new
// HUMAN_RULES + per-turn flavor can be judged on real output.
import { BASE, login, send, history } from './probe-lib.mjs';

const CONV = process.argv[2];
const TEXTS = [
  'what did you eat today?',
  'do you like rain?',
  'tell me about your morning',
  'have you ever seen the sea?',
];

const token = await login();
for (const text of TEXTS) {
  const t = Date.now();
  await send(CONV, text, token);
  await new Promise((r) => setTimeout(r, 1500));
  const msgs = await history(CONV, token);
  const bot = msgs.filter((m) => m.sender !== 'user').slice(-1)[0];
  console.log(`--- me: ${text}  (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  console.log(`    bot: ${JSON.stringify(bot?.text ?? '(none)')}`);
}
