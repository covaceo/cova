import {useEffect,useMemo,useRef,useState} from 'react';
import type {RiskRule,Trade} from '../lib/risk';
import {readBrokerCashEvidence} from '../lib/brokerCash';
import {progressLevel,progressLimits,progressAccount,type ProgressState} from '../lib/passportProgress';
import {requestPassportProgress,type ProgressInspection} from '../lib/passportProgressClient';
export type PassportJournal={read:(day:string)=>string;save:(day:string,note:string)=>boolean};
export function PassportPlanSync({owner,rules}:{owner?:string;rules:RiskRule[]}){
 const signature=JSON.stringify(progressLimits(rules));
 useEffect(()=>{if(!owner)return;let active=true;const timer=setTimeout(()=>{void requestPassportProgress(owner,{action:'plan',limits:JSON.parse(signature)}).catch(()=>{if(active)window.dispatchEvent(new CustomEvent('cova:progress-plan-error',{detail:owner}))})},500);return()=>{active=false;clearTimeout(timer)}},[owner,signature]);
 return null;
}
export function PassportProgress({owner,trades=[],rules=[],sample=false,journal}:{owner?:string;trades?:Trade[];rules?:RiskRule[];sample?:boolean;journal?:PassportJournal}){
 const [state,setState]=useState<ProgressState|null>(null),[inspection,setInspection]=useState<ProgressInspection|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[editing,setEditing]=useState(false),[note,setNote]=useState(''),[saving,setSaving]=useState(false),[attempt,setAttempt]=useState(0),[leveled,setLeveled]=useState(false);
 const generation=useRef(0),controller=useRef<AbortController|null>(null);
 const limits=JSON.stringify(progressLimits(rules));
 const payload=useMemo(()=>{if(sample||!trades.length)return null;const accounts=[...new Set(trades.map(progressAccount))];if(accounts.length!==1)return null;const day=trades.map(t=>t.date).sort().slice(-1)[0];return {account:accounts[0],day,trades:trades.map(t=>({...t,notes:'',setup:''})),cash:owner?readBrokerCashEvidence(trades,owner):null}},[owner,trades,sample,attempt]);
 const identity=JSON.stringify([owner,payload?.account,payload?.day]);
 useEffect(()=>{const run=++generation.current,abort=new AbortController();controller.current=abort;setState(null);setInspection(null);setError('');setEditing(false);setSaving(false);setLoading(true);setLeveled(false);
  if(!owner){setLoading(false);return()=>abort.abort();}
  void(async()=>{try{
   await requestPassportProgress(owner,{action:'plan',limits:JSON.parse(limits)},abort.signal);
   if(payload){const result:ProgressInspection=await requestPassportProgress(owner,{...payload,action:'inspect'},abort.signal);if(run!==generation.current)return;setInspection(result);setState(result.state);setNote(journal?.read(payload.day)||result.receipt?.note||'')}
   else{const result:ProgressState=await requestPassportProgress(owner,undefined,abort.signal);if(run===generation.current)setState(result)}
  }catch(e){if(!abort.signal.aborted&&run===generation.current)setError(e instanceof Error?e.message:'Progress could not load.')}finally{if(!abort.signal.aborted&&run===generation.current)setLoading(false)}})();
  return()=>{abort.abort();generation.current++};
 },[identity,payload,limits,attempt]);
 const summary=state?progressLevel(state.total_xp):null,receipt=inspection?.receipt,fresh=!!receipt&&receipt.evidence_hash===inspection?.evidenceHash;
 const hint=error||(!owner?'Sign in to save your progress.':sample?'Sample data does not earn XP.':!trades.length?'Import a trading session to review.':!payload?'Select one account to review a session.':inspection?.quote.reason||'');
 async function saveReview(){if(!owner||!payload||!inspection||saving)return;const run=generation.current;setSaving(true);setError('');try{const result:ProgressInspection=await requestPassportProgress(owner,{...payload,action:'review',note,revision:receipt?.revision??0},controller.current?.signal);if(run!==generation.current)return;setLeveled(!!summary&&progressLevel(result.state.total_xp).level>summary.level);setState(result.state);setInspection(result);setEditing(false);if(journal&&!journal.save(payload.day,note.trim()))setError('Review saved to your profile; the local journal could not be updated.')}catch(e){if(run===generation.current)setError(e instanceof Error?e.message:'Review could not save.')}finally{if(run===generation.current)setSaving(false)}}
 return <section className={`session-progression ${leveled?'level-up':''}`} aria-label="Session progression" aria-busy={loading||saving}>
  <div className="level-heading"><div className="level-emblem" aria-hidden="true"><span>{summary?.level??'–'}</span></div><div><p className="level-label">Your progress</p><h2>Level {summary?.level??'–'}</h2></div><div className="xp-count"><strong>{summary?.within??'–'}</strong><span> / 100 XP</span></div></div>
  <div className="level-meter" role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary?.within??0}><span style={{width:`${summary?.within??0}%`}}/></div>
  <div className="level-foot"><span>{leveled?'Level up':'Session by session'}</span><span>{summary?`Next: Level ${summary.level+1}`:''}</span></div>
  <div className="session-reward"><div className="reward-top"><div><p className="reward-date">{payload?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(payload.day+'T12:00:00Z')):'Session review'}</p><h3>{loading?'Loading progress…':fresh?'Session reviewed':'Review your session'}</h3></div>{inspection&&<span className={`reward-points ${fresh?'is-earned':''}`}>{(fresh?receipt!.xp:inspection.quote.xp)>0?`+${fresh?receipt!.xp:inspection.quote.xp} XP`:'No XP'}</span>}</div>
   {inspection&&<ul className="reward-checks"><li data-passed={inspection.quote.rulesHeld}><span className="check-mark" aria-hidden="true">{inspection.quote.rulesHeld?'✓':'–'}</span>{inspection.quote.rulesHeld?'Risk limits respected':'Session not eligible'}</li><li data-passed={fresh}><span className="check-mark" aria-hidden="true">{fresh?'✓':'·'}</span>{fresh?'Review saved':'Review to complete'}</li></ul>}
   {hint&&<p className="progress-hint" role={error?'alert':undefined}>{hint}</p>}
   {editing?<div className="session-note"><label htmlFor="passport-takeaway">What will you repeat or change next session?</label><textarea id="passport-takeaway" value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} rows={3}/><div className="review-actions"><button className="button quiet" onClick={()=>setEditing(false)} disabled={saving}>Close</button><button className="button primary" onClick={saveReview} disabled={saving||loading||note.trim().length<10}>{saving?'Saving…':receipt?'Update review':'Save review'}</button></div></div>:inspection&&<button className={`button ${fresh?'quiet':'primary'} review-session-button`} onClick={()=>setEditing(true)} disabled={loading||saving}>{fresh?'View review':receipt?'Update review':'Review session'}</button>}
   {error&&!editing&&<button className="button quiet" onClick={()=>setAttempt(n=>n+1)} disabled={loading}>Retry progress</button>}
   {inspection&&<details className="progress-evidence"><summary>Review basis</summary><p>Based on your imported closed trades and limits saved before the session. Rewards can change after a later sync. Process levels do not change your trading rank.</p>{inspection.asOf&&<p>Data through {new Date(inspection.asOf).toISOString().replace('T',' ').replace('.000Z',' UTC')}</p>}</details>}
  </div>
 </section>;
}
