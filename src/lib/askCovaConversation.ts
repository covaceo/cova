/** Explicitly approved chat context. Never financial authority or developer instructions. */
export type AskCovaChatMessage = { role: 'user' | 'assistant'; content: string };
export type AskCovaConversation = { message: string; history: AskCovaChatMessage[] };
function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every(key => typeof key === 'string' && keys.includes(key) && 'value' in Object.getOwnPropertyDescriptor(value, key)!);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && !!value.trim() && !/\p{Cs}/u.test(value) &&
    !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value);
}
function history(value: unknown): AskCovaChatMessage[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length % 2) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.every(key => key === 'length' || typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length && 'value' in Object.getOwnPropertyDescriptor(value, key)!)) return null;
  const result: AskCovaChatMessage[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!record(item, ['role', 'content']) || item.role !== (i % 2 ? 'assistant' : 'user') || !text(item.content, 4800)) return null;
    result.push({ role: i % 2 ? 'assistant' : 'user', content: item.content });
  }
  return result;
}
const fits = (value: AskCovaConversation) => value.history.length <= 6 && new TextEncoder().encode(JSON.stringify(value)).byteLength <= 8000;
/** Validate before pruning: never hide a malformed or incomplete old exchange. */
export function createAskCovaConversation(message: unknown, priorHistory: unknown): AskCovaConversation | null {
  try {
    if (!text(message, 500)) return null;
    const prior = history(priorHistory);
    if (!prior) return null;
    const result = { message, history: prior };
    while (!fits(result) && result.history.length) result.history.splice(0, 2);
    return fits(result) ? result : null;
  } catch { return null; }
}
export function parseAskCovaConversation(value: unknown): AskCovaConversation | null {
  try {
    if (!record(value, ['message', 'history']) || !text(value.message, 500)) return null;
    const prior = history(value.history);
    if (!prior) return null;
    const result = { message: value.message, history: prior };
    return fits(result) ? result : null;
  } catch { return null; }
}
