/** Languages the app offers. Names are written in their own script so a learner spots them at a glance. */
export const LANG_LIST = [
  ['ru', 'Русский'], ['en', 'English'], ['uk', 'Українська'], ['de', 'Deutsch'],
  ['fr', 'Français'], ['es', 'Español'], ['ja', '日本語'],
] as const;

export const langName = (code: string): string =>
  LANG_LIST.find(([value]) => value === code)?.[1] ?? code;
