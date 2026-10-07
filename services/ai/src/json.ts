/** Pull a JSON object out of an LLM reply: fences, prose, raw newlines inside strings, trailing commas. */

function sliceObject(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  if (start === -1) throw new Error('no json object found');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  // unbalanced (answer got cut off) — hand back the tail and let the repair pass try
  return body.slice(start);
}

/** Escape control characters that sit inside string literals and drop trailing commas. */
function repair(json: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (const ch of json) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === '\\') { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') continue;
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

export function extractJsonObject(text: string): unknown {
  const candidate = sliceObject(text);
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(repair(candidate));
  }
}
