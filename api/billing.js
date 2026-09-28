import {requireAuthenticatedUser,requirePolicyAcceptedUser,sendApiError} from './_lib/auth.js';
import webhook from './_lib/billing-webhook.js';
import {BillingError} from './_lib/billing.js';
import {billingRuntime} from './_lib/billing-runtime.js';
export const config={api:{bodyParser:false}};
export default async function handler(req,res){
 if(new URL(req.url||'/api/billing','https://local.invalid').searchParams.get('webhook')==='1') return webhook(req,res);
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
 try {
  // Portal and status stay accessible even when a new legal policy needs acceptance.
  const user=await requireAuthenticatedUser(req,{billing:false});
  const runtime=billingRuntime();if(!runtime)throw new BillingError(503,'Billing is not enabled yet.');
  if(req.headers?.origin&&req.headers.origin!==runtime.config.origin)throw new BillingError(403,'Open billing from the Cova preview.');
  if(req.method==='GET')return res.status(200).json(await runtime.service.status(user));
  let body=req.body;
  if(body===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>16384)throw new BillingError(413,'Billing request is too large.');chunks.push(Buffer.from(chunk));}body=Buffer.concat(chunks).toString('utf8');}
  if(typeof body==='string'||Buffer.isBuffer(body)){try{body=JSON.parse(String(body));}catch{throw new BillingError(400,'Invalid billing request.');}}
  if(!body||Object.keys(body).some(k=>k!=='action')||!['checkout','portal','cancel'].includes(body.action))throw new BillingError(400,'Choose a valid billing action.');
  if(body.action==='checkout')await requirePolicyAcceptedUser(req,{billing:false});
  return res.status(200).json(await runtime.service[body.action](user));
 }catch(error){return sendApiError(res,error,'Billing could not be verified. Please try again.');}
}
