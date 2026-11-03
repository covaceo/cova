import type { AskCovaQuestion } from './askCova';

export const MAX_ASK_COVA_INPUT = 500;
export type AskCovaIntent = { kind: 'question'; question: AskCovaQuestion } | { kind: 'detail' } | { kind: 'trades' } | { kind: 'unsupported' };

/** Local routing only. Never forwards typed text or changes the selected scope. */
export function resolveAskCovaIntent(text: string): AskCovaIntent {
  if (typeof text !== 'string' || text.length > MAX_ASK_COVA_INPUT || /[\u0000-\u001f\u007f]/.test(text)) return { kind: 'unsupported' };
  // Entire-phrase grammars, not keyword triggers. Corrections are local and bounded;
  // no typed text, instruction, credential, date or account reaches the provider.
  const phrase = text.trim().toLowerCase().replace(/[.!?]+$/, '').trim()
    .replace(/\bporiftable\b/g, 'profitable').replace(/\bholda trader\b/g, 'hold a trade')
    .replace(/\bhold a trader(?= longer\b)/g, 'hold a trade')
    .replace(/\bshortingorlonging\b/g, 'shorting or longing').replace(/\bwhat['’]s\b/g, 'what is').replace(/ +/g, ' ')
    .replace(/^(?:please,? |(?:could|can|would) you (?:please )?(?:tell me,? )?)/, '')
    .replace(/,? please$/, '');
  const routes: [AskCovaQuestion, RegExp][] = [
    ['holding_time', /^(?:am i (?:more profitable|better) when i hold (?:trades|a trade) longer|when i hold (?:trades|a trade) longer,? (?:am i (?:more profitable|better)|do i make more money)|does holding (?:(?:trades|a trade) )?longer (?:improve my results|make me more profitable)|how does holding time affect my results|compare (?:my )?short and long holds|do longer holds perform better|is holding trades longer more profitable|am i more profitable the longer i hold (?:a trade|trades)|do i make more money when i hold (?:a trade|trades) longer|holding time)$/],
    ['setup_performance', /^(?:(?:what|which) (?:of my )?setup works (?:the )?best(?: for me)?|which of my setups works (?:the )?best|(?:what|which) (?:of my )?setups? (?:is|are) (?:the )?(?:most profitable|best)|compare my setups|what is my best setup|which setup performs (?:the )?best|which setups work (?:the )?best|what are my best setups|setup performance)$/],
    ['time_of_day', /^(?:(?:at )?what time of day am i (?:most profitable|best at trading)|which time of day is most profitable for me|when do i trade best|what is my best time of day|compare my entry times|when am i most profitable|which trading hours are most profitable|time of day performance)$/],
    ['long_vs_short', /^(?:am i better at (?:shorting or longing|longing or shorting|shorts or longs|longs or shorts)|compare (?:my )?(?:longs (?:versus|vs|and) shorts|shorts (?:versus|vs|and) longs)|long vs short|are my (?:longs (?:more profitable|better) than my shorts|shorts (?:more profitable|better) than my longs)|do (?:longs or shorts|shorts or longs) work better for me|am i more profitable going (?:long or short|short or long)|which performs better,? (?:longs or shorts|shorts or longs))$/],
  ];
  for (const [question, grammar] of routes) if (grammar.test(phrase)) return { kind: 'question', question };
  if (['review my results', 'how did i do', 'what are my results'].includes(phrase)) return { kind: 'question', question: 'review_results' };
  if (['explain my drawdown', 'what was my drawdown', 'how big was the dip'].includes(phrase)) return { kind: 'question', question: 'explain_drawdown' };
  if (['what stands out', 'anything stand out', 'what should i review'].includes(phrase)) return { kind: 'question', question: 'what_stands_out' };
  if (['which trades', 'show trades', 'show me the trades', 'show my trades'].includes(phrase)) return { kind: 'trades' };
  if (['tell me more', 'more details', 'explain that'].includes(phrase)) return { kind: 'detail' };
  return { kind: 'unsupported' };
}
