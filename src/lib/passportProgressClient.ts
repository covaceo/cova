

import type { ProgressState, ProgressReceipt, ProgressQuote } from './passportProgress';
export type ProgressInspection={state:ProgressState;quote:ProgressQuote;receipt:ProgressReceipt|null;evidenceHash:string;asOf:string|null};
async function requireOwner(owner:string){const {getSupabaseClient}=await import('./supabaseClient');const client=getSupabaseClient();const session=client?await client.auth.getSession():null;if(!owner||session?.data.session?.user.id!==owner)throw Error('Your session changed. Sign in again.');}
export async function requestPassportProgress(owner:string,body?:Record<string,unknown>,signal?:AbortSignal):Promise<any>{
 await requireOwner(owner);const {authorizedFetch}=await import('./apiClient');if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const response=await authorizedFetch(body?'/api/passport':'/api/passport?owner='+encodeURIComponent(owner),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify({...body,owner}):undefined,signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)])});
 const result=await response.json();await requireOwner(owner);if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 if(!response.ok)throw Error(typeof result?.error==='string'?result.error:'Progress could not be loaded.');
 const state:ProgressState|undefined=result.state??(result.total_xp!==undefined?result:undefined);
 if(state&&(state.owner_id!==owner||!Number.isSafeInteger(state.total_xp)||state.total_xp<0||!Array.isArray(state.receipts)||state.receipts.some(r=>r.owner_id!==owner||![0,15,60].includes(r.xp))))throw Error('Progress does not match your signed-in account.');
 if(result.receipt&&result.receipt.owner_id!==owner)throw Error('Review does not match your signed-in account.');
 return result;
}
