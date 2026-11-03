import type { AskCovaQuestion } from './askCova';

export const MAX_ASK_COVA_INPUT = 500;
export type AskCovaIntent = { kind: 'question'; question: AskCovaQuestion } | { kind: 'detail' } | { kind: 'trades' } | { kind: 'unsupported' };

/** Local routing only. Never forwards typed text or changes the selected scope. */
export function resolveAskCovaIntent(text: string): AskCovaIntent {
  if (typeof text !== 'string' || text.length > MAX_ASK_COVA_INPUT) return { kind: 'unsupported' };
  const phrase = text.trim().toLowerCase().replace(/[.!?]+$/, '').trim();
  if (['review my results', 'how did i do', 'what are my results'].includes(phrase)) return { kind: 'question', question: 'review_results' };
  if (['explain my drawdown', 'what was my drawdown', 'how big was the dip'].includes(phrase)) return { kind: 'question', question: 'explain_drawdown' };
  if (['what stands out', 'anything stand out', 'what should i review'].includes(phrase)) return { kind: 'question', question: 'what_stands_out' };
  if (['which trades', 'show trades', 'show me the trades', 'show my trades'].includes(phrase)) return { kind: 'trades' };
  if (['tell me more', 'more details', 'explain that'].includes(phrase)) return { kind: 'detail' };
  return { kind: 'unsupported' };
}
