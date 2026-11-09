import { useEffect, useRef, useState } from 'react';
import type { Trade } from '../lib/risk';
import { ASK_COVA_QUESTIONS } from '../lib/askCova';
import { AskCovaDataEvidence } from './AskCovaDataEvidence';
import { askCovaVisibleNotices } from '../lib/askCovaNoticePresentation';
import { createAskCovaConversation, type AskCovaConversation as ChatContext, type AskCovaChatMessage } from '../lib/askCovaConversation';
import { MAX_ASK_COVA_INPUT } from '../lib/askCovaIntent';
import { askCovaAccessCurrent } from '../lib/askCovaClient';
import { requestAskCovaQuery, ASK_COVA_QUERY_TIMEOUT_MS } from '../lib/askCovaQueryClient';
import { TradeHistoryDialog } from './TradeHistoryDialog';
import '../styles/askCova.css';

export type AskCovaProps = {
  ownerId: string; account: string; range: 'today' | 'week' | 'all';
  trades: readonly Trade[]; ready: boolean;
  authorityKey?: string;
  onRangeChange?: (range: 'today' | 'week' | 'all') => void;
  captureAuthority?: () => Promise<(() => boolean) | null>;
  request?: typeof requestAskCovaQuery;
  ownerCurrent?: (owner: string) => boolean;
};
const MAX_EXCHANGES = 20;
type Reply = Extract<Awaited<ReturnType<typeof requestAskCovaQuery>>, { status: 'ok' }>['reply'];
type Exchange = { id: number; text: string; savedCurrent?: () => boolean; previousSnapshotDigest?: string; context?: ChatContext; historyText?: string; fromComposer?: boolean; reply?: Reply; detailSource?: { exchange: Exchange; reply: Reply; contextDigest: string }; local?: string };

/** Changing scope synchronously unmounts the old conversation and aborts its request. */
export function AskCova(props: AskCovaProps) {
  const scope = JSON.stringify([props.ownerId, props.account, props.range, props.ready, props.authorityKey, props.trades]);
  return <AskCovaConversation key={scope} {...props} />;
}
function AskCovaConversation({ ownerId, account, range, trades, ready, request = requestAskCovaQuery, captureAuthority, onRangeChange, ownerCurrent = askCovaAccessCurrent }: AskCovaProps) {
  const [draft, setDraft] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [selected, setSelected] = useState<Exchange | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [evidenceReply, setEvidenceReply] = useState<Reply | null>(null);
  const [dataEvidence, setDataEvidence] = useState<Exchange | null>(null);
  const [noticeDetails, setNoticeDetails] = useState<ReadonlySet<number>>(new Set());
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
    setDraft(''); setExchanges([]); setSelected(null); setError(''); setEvidenceReply(null); setDataEvidence(null); setBusy(false);
    setNoticeDetails(new Set());
  }
  function currentEpoch(origin: number) {
    return conversation.current.active && conversation.current.epoch === origin;
  }
  function checkAuthority() {
    if (!conversation.current.active) return false;
    const savedChanged = conversation.current.exchanges.some(item => item.reply && item.savedCurrent?.() !== true);
    if (ready && authority.current(ownerId) && !savedChanged) return true;
    clear();
    setError(savedChanged ? 'Your saved account data changed. Ask again to use the updated data.' : 'Your session changed. Sign in again to ask Cova.');
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
    if (!exchange.context || !ownsExchange() || pending.current || conversation.current.exchanges.some(item => item.id === exchange.id && item.reply) || !checkAuthority()) return;
    restoreComposer.current = exchange.fromComposer === true;
    const controller = new AbortController(); pending.current = controller;
    const ownsRequest = () => ownsExchange() && pending.current === controller && !controller.signal.aborted;
    const expire = () => {
      if (!ownsRequest() || !checkAuthority()) return;
      controller.abort(); pending.current = null; setBusy(false);
      setError('That took too long. You can try again when you’re ready.');
    };
    let timer = window.setTimeout(expire, ASK_COVA_QUERY_TIMEOUT_MS);
    setError(''); setBusy(true);
    try {
      const savedCurrent = await captureAuthority?.();
      if (!ownsRequest() || !checkAuthority()) return;
      if (!savedCurrent || !savedCurrent()) { setError('Let your saved account data finish syncing, then ask again.'); return; }
      // Capture has its own watchdog. Start one shared post-capture deadline so
      // the UI cannot expire a reply earlier than the actual client's contract.
      window.clearTimeout(timer);
      const requestEnd = performance.now() + ASK_COVA_QUERY_TIMEOUT_MS;
      timer = window.setTimeout(expire, Math.max(0, requestEnd - performance.now()));
      exchange.savedCurrent = savedCurrent;
      const current = () => ownsRequest() && ready && authority.current(ownerId) && savedCurrent();
      const response = await request({ owner: ownerId, account, range,
        requestId: crypto.randomUUID(), conversation: exchange.context, previousSnapshotDigest: exchange.previousSnapshotDigest }, controller.signal, undefined, current, requestEnd);
      if (!current() || !checkAuthority()) return;
      if (response.status !== 'ok') { if ('revokeHistory' in response && response.revokeHistory) clear(); setError(response.message); return; }
      const checked = response.reply, historyText = response.historyText;
      if (!checked || !historyText) throw Error('Unchecked answer');
      conversation.current.exchanges = conversation.current.exchanges.map(item => item.id === exchange.id ? { ...item, reply: checked, historyText } : item);
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

  function choose(text: string, fromComposer = false) {
    if (!canAppend()) return;
    if (!currentEpoch(epoch) || !checkAuthority()) return;
    // Snapshot only complete, successfully checked exchanges in this scope/epoch.
    // Never reconstruct model history from rendered text (which contains private aliases).
    const history = conversation.current.exchanges.flatMap<AskCovaChatMessage>(item => item.reply && item.historyText
      ? [{ role: 'user', content: item.text }, { role: 'assistant', content: item.historyText }] : []);
    const context = createAskCovaConversation(text, history);
    if (!context) { setError("I couldn't send that message. Try a shorter message without special control characters."); return; }
    const previousSnapshotDigest = [...conversation.current.exchanges].reverse().find(item => item.reply)?.reply?.snapshotDigest;
    const exchange = { id: ++sequence.current, text, context, fromComposer, previousSnapshotDigest };
    if (!append(exchange)) return;
    conversation.current.selected = exchange;
    setSelected(exchange); setError('');
    void ask(exchange, epoch);
  }
  function checkedReply(exchange: Exchange, origin: number) {
    return currentEpoch(origin) && checkAuthority() && !!exchange.reply && exchange.savedCurrent?.() === true
          && conversation.current.exchanges.some(item => item.id === exchange.id && item.reply === exchange.reply);
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

    current.draft = ''; setDraft('');

    if (!checkAuthority()) return;
    const latest = [...current.exchanges].reverse().find(item => item.reply && item.historyText);
    // Explicit evidence navigation stays local; normal typed follow-ups go to the model.
    if (/^(?:which|show|view)(?: the)? trades[.!?]?$/i.test(text) && latest) { followUp(latest, origin, 'trades', text); return; }
    choose(text, true);
  }
  const evidence = evidenceReply ? evidenceReply.snapshot.workspaceRecords.filter(record => record.kind === 'trade' && !record.deletedAt && evidenceReply.tradeIds.includes(record.recordId)).map(record => record.payload as unknown as Trade) : [];
  return <section className="ask-cova" aria-labelledby="ask-cova-title" data-ask-cova>
    <div className="ask-cova-heading"><div className="ask-cova-title"><h2 id="ask-cova-title">Ask Cova</h2><span className="ask-cova-beta">Beta</span></div>
      {(exchanges.length > 0 || error) && <button className="astra-text-link" type="button" onClick={clear}>Clear conversation</button>}
    </div>
    {trades.length === 0 && onRangeChange && <div className="ask-cova-actions" role="group" aria-label="Saved data range">{([{ id: 'today', label: 'Latest saved day' }, { id: 'week', label: 'Last 7 calendar days' }, { id: 'all', label: 'All saved history' }] as const).map(option => <button className="astra-text-link" type="button" key={option.id} aria-pressed={range === option.id} onClick={() => { if (currentEpoch(epoch) && checkAuthority()) onRangeChange(option.id); }}>{option.label}</button>)}</div>}
    {!ready ? <p className="ask-cova-notice">Save your account workspace before asking Cova.</p> : exchanges.length > 0 && <div className="ask-cova-conversation" role="log" aria-label="Conversation with Cova" aria-live="polite" aria-relevant="additions text">
      {exchanges.map(exchange => <div className="ask-cova-exchange" key={exchange.id}>
        <p className="ask-cova-question"><span className="sr-only">You: </span>{exchange.text}</p>
        {exchange.detailSource && exchange.detailSource.contextDigest === exchange.detailSource.reply.contextDigest && conversation.current.exchanges.some(item => item.id === exchange.detailSource!.exchange.id && item.reply === exchange.detailSource!.reply) && <div className="ask-cova-reply">{exchange.detailSource.reply.detail.map((text,index)=><p data-cova-detail key={index}>{text}</p>)}</div>}
        {exchange.local && <div className="ask-cova-reply"><p data-cova-local>{exchange.local}</p></div>}
        {exchange.reply && <div className="ask-cova-response" role="group" aria-label={`Cova reply to ${exchange.text}`} data-cova-reply={exchange.id}>
          <div className="ask-cova-reply">{exchange.reply.paragraphs.map((text,index)=><p data-cova-answer key={index}>{text}</p>)}{askCovaVisibleNotices(exchange.reply.scopeNotices).length > 0 && <p className="ask-cova-notice" data-cova-qualifiers>{askCovaVisibleNotices(exchange.reply.scopeNotices).join(' ')}</p>}</div>
          <div className="ask-cova-actions">
            {exchange.reply.supports.some(s => s.kind !== 'trade') && <button className="astra-text-link" type="button" onClick={() => { if (checkedReply(exchange, epoch)) setDataEvidence(exchange); }}>Show saved data</button>}
            {exchange.reply.tradeIds.length > 0 && <button className="astra-text-link" type="button" onClick={() => { if (checkedReply(exchange, epoch)) setEvidenceReply(exchange.reply!); }}>Show trades</button>}
            {exchange.reply.detail.length > 0 && <button className="astra-text-link" type="button" disabled={busy || atLimit} onClick={() => followUp(exchange, epoch, 'detail', 'Tell me more')}>Tell me more</button>}
            {exchange.reply.scopeNotices.length > 0 && <button className="astra-text-link" type="button" aria-expanded={noticeDetails.has(exchange.id)} aria-controls={`cova-notices-${exchange.id}`} onClick={() => {
              if (!checkedReply(exchange, epoch)) return;
              setNoticeDetails(current => { const next = new Set(current); if (next.has(exchange.id)) next.delete(exchange.id); else next.add(exchange.id); return next; });
            }}>Answer details</button>}
          </div>
          {exchange.reply.scopeNotices.length > 0 && <div id={`cova-notices-${exchange.id}`} className="ask-cova-reply" hidden={!noticeDetails.has(exchange.id)}>{exchange.reply.scopeNotices.map(notice => <p className="ask-cova-notice" key={notice}>{notice}</p>)}</div>}
        </div>}
      </div>)}

      {busy && <p className="ask-cova-processing" role="status" data-cova-processing><span className="ask-cova-dots" aria-hidden="true"><i /><i /><i /></span>Checking your results…</p>}
    </div>}
    {error && <div className="ask-cova-error"><p role="status">{error}</p>{selected && <button className="astra-text-link" type="button" onClick={() => void ask(selected, epoch)}>Try again</button>}</div>}
    {atLimit && <p className="ask-cova-notice" role="status">This conversation has reached 20 messages. Clear it to start another review.</p>}
    <div className="ask-cova-questions" aria-label="Questions for Cova">{ASK_COVA_QUESTIONS.map(item =>
      <button className="astra-button" type="button" key={item.id} disabled={!ready || busy || atLimit} onClick={() => choose(item.label)}>{item.label}</button>)}</div>
    <form className="ask-cova-composer" onSubmit={event => { event.preventDefault(); send(epoch); }}>
      <textarea ref={composer} aria-label="Message Cova" placeholder="Message Cova" rows={1} maxLength={MAX_ASK_COVA_INPUT} value={draft} disabled={!ready || busy || atLimit} onChange={event => { if (currentEpoch(epoch)) { conversation.current.draft = event.target.value; setDraft(event.target.value); } }} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(epoch); }
      }} />
      <button className="astra-button" type="submit" aria-label="Send message" disabled={!draft.trim() || !ready || busy || atLimit}>Send</button>
    </form>
    <p className="ask-cova-notice">Your message, recent Cova chat, and relevant saved account data, including notes, rules and Passport, are sent for AI responses. Only your selected account and date range are used; current rules and plans are owner-wide.</p>
    {dataEvidence?.reply && dataEvidence.savedCurrent?.() === true && <div><AskCovaDataEvidence snapshot={dataEvidence.reply.snapshot} supports={dataEvidence.reply.supports} /><button className="astra-text-link" type="button" onClick={() => { if (currentEpoch(epoch)) setDataEvidence(null); }}>Close saved data</button></div>}
    {evidenceReply && evidence.length > 0 && <TradeHistoryDialog title="Trades behind this answer" scopeLabel="Selected answer" trades={evidence} journalReview={true} showSummary={false} onClose={() => { if (currentEpoch(epoch)) setEvidenceReply(null); }} />}
  </section>;
}

