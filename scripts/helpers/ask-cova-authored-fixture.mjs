// SYNTHETIC CONTRACT FIXTURES ONLY. Not production prose or voice evaluation.
export function syntheticAnswer(packet, variant = 'plain') {
  const evidence = [...packet.requiredAnswerEvidence];
  const observations = packet.observations.filter(o=>evidence.includes(o.id));
  const ids = new Set(observations.flatMap(o=>o.facts));
  const facts = packet.facts.filter(f=>ids.has(f.id));
  const categories = [...new Set(observations.flatMap(o=>o.categories))];
  const text = packet.observations.some(o=>o.predicates.includes('empty')) ? 'Log or import a completed trade to begin.' : `${variant === 'warm' ? 'here is the checked record.' : variant === 'direct' ? 'the checked record follows.' : 'these are the checked results.'} ${categories.map(id=>`{{c:${id}}}`).join(' ')} ${facts.map(f=>`${f.id.replaceAll('_',' ')}: {{f:${f.id}}}.`).join(' ')}`.trim();
  return {version:'ask-cova-answer-v1',paragraphs:[{text,evidence}],detail:[{text:facts.length?`the supporting value is {{f:${facts[0].id}}}. this is descriptive evidence, not a forecast.`:'there is no usable evidence for this question in the selected range.',evidence}]};
}
export function syntheticEnvelope(answer) {
 return {model:'gpt-6-luna',status:'completed',service_tier:'default',usage:{input_tokens:500,output_tokens:200},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(answer),annotations:[]}]}]};
}
