/** Human-readable language names for prompts (zod codes → English names). */
export function langName(code: string): string {
  return ({ en: 'English', ru: 'Russian', de: 'German', fr: 'French', es: 'Spanish', uk: 'Ukrainian' } as Record<string, string>)[code] ?? code;
}
