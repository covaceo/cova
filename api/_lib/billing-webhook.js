import {BillingError} from './billing.js';
import {billingRuntime} from './billing-runtime.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 try{
  const runtime=billingRuntime();if(!runtime?.config.webhookSecret)throw new BillingError(503,'Webhook is not configured.');
  const parts=[];let length=0;for await(const chunk of req){const buffer=Buffer.from(chunk);length+=buffer.length;if(length>524288)throw new BillingError(413,'Webhook payload too large.');parts.push(buffer);}
  let event;try{event=runtime.stripe.webhooks.constructEvent(Buffer.concat(parts),req.headers['stripe-signature'],runtime.config.webhookSecret);}catch{throw new BillingError(400,'Invalid webhook signature.');}
  return res.status(200).json(await runtime.service.webhook(event));
 }catch(error){const status=error.statusCode===409?503:error.statusCode||503;return res.status(status).json({error:status>=500?'Webhook could not be processed.':error.message});}
}
