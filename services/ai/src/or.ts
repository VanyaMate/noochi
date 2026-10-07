import { AppError } from '@noochi/shared';

export interface OrMessage { role: 'system' | 'user' | 'assistant'; content: string }

const OR_URL = 'https://openrouter.ai/api/v1';

interface OrOpts {
  apiKey: string;
  model: string;
  messages: OrMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Override for proxies / self-hosted gateways; defaults to the public OpenRouter API. */
  baseUrl?: string;
  onDelta?: (delta: string) => void;
}

async function orFetch(opts: OrOpts, stream: boolean): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${opts.baseUrl ?? OR_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://noochi.app',
        'X-Title': 'Noochi language practice',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.9,
        max_tokens: opts.maxTokens ?? 700,
        stream,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AppError('AI_UPSTREAM', `OpenRouter ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Non-streaming completion, returns full text. */
export async function chatCompletion(opts: OrOpts): Promise<string> {
  const res = await orFetch(opts, false);
  const json = await res.json() as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? '';
}

/** Streaming completion; calls onDelta per token chunk; returns full text. */
export async function chatCompletionStream(opts: OrOpts): Promise<string> {
  const res = await orFetch(opts, true);
  if (!res.body) throw new AppError('AI_UPSTREAM', 'no stream body');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) { full += delta; opts.onDelta?.(delta); }
      } catch { /* partial json */ }
    }
  }
  return full;
}
