import { useEffect, useRef, useState } from 'react';
import type { Trade } from '../lib/risk';
import { ASK_COVA_QUESTIONS, buildAskCovaCatalog, renderAskCovaAnswer, type AskCovaQuestion } from '../lib/askCova';
import { MAX_ASK_COVA_INPUT, resolveAskCovaIntent } from '../lib/askCovaIntent';
import { requestAskCova, askCovaAccessCurrent } from '../lib/askCovaClient';
import { TradeHistoryDialog } from './TradeHistoryDialog';
import '../styles/askCova.css';

export type AskCovaProps = {
  ownerId: string; account: string; range: 'today' | 'week' | 'all';
  trades: readonly Trade[]; ready: boolean;
  request?: typeof requestAskCova;
  ownerCurrent?: (owner: string) => boolean;
};
const MAX_EXCHANGES = 20;
type Reply = NonNullable<ReturnType<typeof renderAskCovaAnswer>>;
type Exchange = { id: number; text: string; question?: AskCovaQuestion; fromComposer?: boolean; reply?: Reply; detailSource?: { exchange: Exchange; reply: Reply; contextDigest: string }; local?: string };

/** Changing scope synchronously unmounts the old conversation and aborts its request. */
export function AskCova(props: AskCovaProps) {
  const scope = JSON.stringify([props.ownerId, props.account, props.range, props.ready, props.trades]);
  return <AskCovaConversation key={scope} {...props} />;
}
function AskCovaConversation({ ownerId, account, range, trades, ready, request = requestAskCova, ownerCurrent = askCovaAccessCurrent }: AskCovaProps) {
  const [draft, setDraft] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [selected, setSelected] = useState<Exchange | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [evidenceReply, setEvidenceReply] = useState<Reply | null>(null);
  const atLimit = exchanges.length >= MAX_EXCHANGES;
  const composer = useRef<HTMLTextAreaElement>(null);
  const wasBusy = useRef(false);
  const restoreComposer = useRef(false);
  const sequence = useRef(0);
  const pending = useRef<AbortController | null>(null);
  // Event authority is synchronous; React state below is only its rendered mirror.
  // Never copy rendered state back here: a batched handler may already have advanced it.
  const conversation = useRef({ epoch: 0, active: true, draft: '', exchanges: [] as Exchange[], selected: null as Exchange | null });
  const epoch = conversation.current.epoch;
  const authority = useRef(ownerCurrent);
  authority.current = ownerCurrent;
  useEffect(() => {
    conversation.current.active = true;
    return () => {
      conversation.current.active = false;
      pending.current?.abort(); pending.current = null;
    };
  }, []);
  useEffect(() => {
    const completed = wasBusy.current && !busy;
    wasBusy.current = busy;
    // Do not steal focus if the user moved to an older reply or evidence dialog.
    if (completed && restoreComposer.current && document.activeElement === document.body && !document.querySelector('dialog[open]')) composer.current?.focus({ preventScroll: true });
  }, [busy]);
  function clear() {
    const current = conversation.current;
    current.epoch++; current.draft = ''; current.exchanges = []; current.selected = null;
    pending.current?.abort(); pending.current = null;
    restoreComposer.current = false;
    setDraft(''); setExchanges([]); setSelected(null); setError(''); setEvidenceReply(null); setBusy(false);
  }
  function currentEpoch(origin: number) {
    return conversation.current.active && conversation.current.epoch === origin;
  }
  function checkAuthority() {
    if (!conversation.current.active) return false;
    if (ready && authority.current(ownerId)) return true;
    clear();
    setError('Your session changed. Sign in again to ask Cova.');
    return false;
  }
  function canAppend() {
    const current = conversation.current;
    return current.active && ready && !pending.current && current.exchanges.length < MAX_EXCHANGES;
  }
  function append(exchange: Exchange) {
    if (!canAppend()) return false;
    conversation.current.exchanges = [...conversation.current.exchanges, exchange];
    setExchanges(conversation.current.exchanges);
    return true;
  }
  async function ask(exchange: Exchange, origin: number) {
    const ownsExchange = () => currentEpoch(origin) && conversation.current.selected?.id === exchange.id
      && conversation.current.exchanges.some(item => item.id === exchange.id);
    if (!exchange.question || !ownsExchange() || pending.current || conversation.current.exchanges.some(item => item.id === exchange.id && item.reply) || !checkAuthority()) return;
    restoreComposer.current = exchange.fromComposer === true;
    const controller = new AbortController(); pending.current = controller;
    const ownsRequest = () => ownsExchange() && pending.current === controller && !controller.signal.aborted;
    const timer = window.setTimeout(() => {
      if (!ownsRequest() || !checkAuthority()) return;
      controller.abort(); pending.current = null; setBusy(false);
      setError('That took too long. You can try again when you’re ready.');
    }, 25000);
    setError(''); setBusy(true);
    try {
      const catalog = await buildAskCovaCatalog({ ownerId, account, range, question: exchange.question, trades });
      if (!ownsRequest() || !checkAuthority()) return;
      const response = await request({ owner: ownerId, account, range, question: exchange.question,
        contextDigest: catalog.contextDigest, requestId: crypto.randomUUID() }, controller.signal);
      if (!ownsRequest() || !checkAuthority()) return;
      if (response.status !== 'ok') { setError(response.message); return; }
      const checked = response.aiResponseUsed === true && response.contextDigest === catalog.contextDigest
        ? renderAskCovaAnswer(catalog, response.answer) : null;
      if (!checked) throw Error('Unchecked answer');
      conversation.current.exchanges = conversation.current.exchanges.map(item => item.id === exchange.id ? { ...item, reply: checked } : item);
      setExchanges(conversation.current.exchanges);
    } catch {
      if (ownsRequest() && checkAuthority()) setError("I couldn't check that answer. Your trades are unchanged. Try again when you're ready.");
    } finally {
      window.clearTimeout(timer);
      if (ownsRequest() && checkAuthority()) {
        pending.current = null; setBusy(false);
      }
    }
  }

  function choose(id: AskCovaQuestion, text = ASK_COVA_QUESTIONS.find(item => item.id === id)!.label, fromComposer = false) {
    if (!canAppend()) return;
    if (!currentEpoch(epoch) || !checkAuthority()) return;
    const exchange = { id: ++sequence.current, text, question: id, fromComposer };
    if (!append(exchange)) return;
    conversation.current.selected = exchange;
    setSelected(exchange); setError('');
    void ask(exchange, epoch);
  }
  function checkedReply(exchange: Exchange, origin: number) {
    return currentEpoch(origin) && !!exchange.reply
      && conversation.current.exchanges.some(item => item.id === exchange.id && item.reply === exchange.reply) && checkAuthority();
  }
  function followUp(exchange: Exchange, origin: number, kind: 'detail' | 'trades', text: string) {
    if (!checkedReply(exchange, origin) || !canAppend()) return;
    const reply = exchange.reply!;
    if (kind === 'detail' && !reply.detail.length) return;
    if (!append({ id: ++sequence.current, text, ...(kind === 'detail' ? { detailSource: {exchange, reply, contextDigest: reply.contextDigest} } : { local: reply.tradeIds.length ? 'These are the trades behind that answer.' : 'There are no trades behind that answer.' }) })) return;
    if (kind === 'trades' && reply.tradeIds.length) setEvidenceReply(reply);
  }
  function send(origin: number) {
    const current = conversation.current;
    const text = current.draft.trim();
    if (!currentEpoch(origin) || !text || text.length > MAX_ASK_COVA_INPUT || !canAppend()) return;
    const intent = resolveAskCovaIntent(text);
    current.draft = ''; setDraft('');
    if (intent.kind === 'question') { choose(intent.question, text, true); return; }
    if (!checkAuthority()) return;
    if (intent.kind === 'detail' || intent.kind === 'trades') {
      const latest = [...current.exchanges].reverse().find(item => item.reply);
      if (latest) { followUp(latest, origin, intent.kind, text); return; }
      append({ id: ++sequence.current, text, local: 'Ask a starter question first, then I can show its details or trades.' });
      return;
    }
    append({ id: ++sequence.current, text, local: 'I can review your results, explain your drawdown, or show what stands out. Try one of the starter questions.' });
  }
  const evidence = evidenceReply ? trades.filter(trade => evidenceReply.tradeIds.includes(trade.id)) : [];
  return <section className="ask-cova" aria-labelledby="ask-cova-title" data-ask-cova>
    <div className="ask-cova-heading"><div className="ask-cova-title"><h2 id="ask-cova-title">Ask Cova</h2><span className="ask-cova-beta">Beta</span></div>
      {(exchanges.length > 0 || error) && <button className="astra-text-link" type="button" onClick={clear}>Clear conversation</button>}
    </div>
    {!ready ? <p className="ask-cova-notice">Save your account workspace before asking Cova.</p> : exchanges.length > 0 && <div className="ask-cova-conversation" role="log" aria-label="Conversation with Cova" aria-live="polite" aria-relevant="additions text">
      {exchanges.map(exchange => <div className="ask-cova-exchange" key={exchange.id}>
        <p className="ask-cova-question"><span className="sr-only">You: </span>{exchange.text}</p>
        {exchange.detailSource && exchange.detailSource.contextDigest === exchange.detailSource.reply.contextDigest && conversation.current.exchanges.some(item => item.id === exchange.detailSource!.exchange.id && item.reply === exchange.detailSource!.reply) && <div className="ask-cova-reply">{exchange.detailSource.reply.detail.map((text,index)=><p data-cova-detail key={index}>{text}</p>)}</div>}
        {exchange.local && <div className="ask-cova-reply"><p data-cova-local>{exchange.local}</p></div>}
        {exchange.reply && <div className="ask-cova-response" role="group" aria-label={`Cova reply to ${exchange.text}`} data-cova-reply={exchange.id}>
          <div className="ask-cova-reply">{exchange.reply.paragraphs.map((text,index)=><p data-cova-answer key={index}>{text}</p>)}{exchange.reply.scopeNotices.map(notice=><p className="ask-cova-notice" key={notice}>{notice}</p>)}</div>
          <div className="ask-cova-actions">
            {exchange.reply.tradeIds.length > 0 && <button className="astra-text-link" type="button" onClick={() => { if (checkedReply(exchange, epoch)) setEvidenceReply(exchange.reply!); }}>Show trades</button>}
            {exchange.reply.detail.length > 0 && <button className="astra-text-link" type="button" disabled={busy || atLimit} onClick={() => followUp(exchange, epoch, 'detail', 'Tell me more')}>Tell me more</button>}
          </div>
        </div>}
      </div>)}

      {busy && <p className="ask-cova-processing" role="status" data-cova-processing><span className="ask-cova-dots" aria-hidden="true"><i /><i /><i /></span>Checking your results…</p>}
    </div>}
    {error && <div className="ask-cova-error"><p role="status">{error}</p>{selected && <button className="astra-text-link" type="button" onClick={() => void ask(selected, epoch)}>Try again</button>}</div>}
    {atLimit && <p className="ask-cova-notice" role="status">This conversation has reached 20 messages. Clear it to start another review.</p>}
    <div className="ask-cova-questions" aria-label="Questions for Cova">{ASK_COVA_QUESTIONS.map(item =>
      <button className="astra-button" type="button" key={item.id} disabled={!ready || busy || atLimit} onClick={() => choose(item.id)}>{item.label}</button>)}</div>
    <form className="ask-cova-composer" onSubmit={event => { event.preventDefault(); send(epoch); }}>
      <textarea ref={composer} aria-label="Message Cova" placeholder="Message Cova" rows={1} maxLength={MAX_ASK_COVA_INPUT} value={draft} disabled={!ready || busy || atLimit} onChange={event => { if (currentEpoch(epoch)) { conversation.current.draft = event.target.value; setDraft(event.target.value); } }} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(epoch); }
      }} />
      <button className="astra-button" type="submit" aria-label="Send message" disabled={!draft.trim() || !ready || busy || atLimit}>Send</button>
    </form>
    {evidenceReply && evidence.length > 0 && <TradeHistoryDialog title="Trades behind this answer" scopeLabel="Selected answer" trades={evidence} journalReview={true} showSummary={false} onClose={() => { if (currentEpoch(epoch)) setEvidenceReply(null); }} />}
  </section>;
}

