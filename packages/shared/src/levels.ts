export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const LEVEL_ORDER: Record<CefrLevel, number> = {
  A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6,
};

export const LEVEL_BLURB: Record<CefrLevel, string> = {
  A1: 'Простые фразы, короткие ответы, базовая лексика',
  A2: 'Бытовые темы, медленная речь, частые слова',
  B1: 'Обычные разговоры, мнение, планы',
  B2: 'Свободное общение, абстракции, сленг',
  C1: 'Живая речь, идиомы, тонкие нюансы',
  C2: 'Как носитель: юмор, сарказм, редкие слова',
};
