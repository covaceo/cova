// Deidentified structural equivalents of the observed Orders/Fills CSV only.
import {archive,archiveDescriptors,definitionsPath,reportPath,json,selection} from './tradovate-stop-history-fixture.mjs';
export const orderHeaders='orderId,Account,Order ID,B/S,Contract,Product,Product Description,avgPrice,filledQty,Fill Time,lastCommandId,Status,_priceFormat,_priceFormatType,_tickSize,spreadDefinitionId,Version ID,Timestamp,Date,Quantity,Text,Type,Limit Price,Stop Price,decimalLimit,decimalStop,Filled Qty,Avg Fill Price,decimalFillAvg,Venue,Notional Value,Currency'.split(',');
export const fillHeaders='_id,_orderId,_contractId,_timestamp,_tradeDate,_action,_qty,_price,_active,_accountId,Fill ID,Order ID,Timestamp,Date,Account,B/S,Quantity,Price,_priceFormat,_priceFormatType,_tickSize,Contract,Product,Product Description,commission'.split(',');
export const csv=(headers,rows)=>[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
export function observed(){
  const orders=[['101','Buy','Market','01','6000'],['103','Sell','Stop','02',''],['104','Buy','Stop','03',''],['102','Sell','Limit','04','6005'],['105','Sell','Stop','05',''],['106','Sell','Stop','08','']].map(([id,side,type,minute,avg])=>({
    orderId:id,Account:'DEMO-SYNTHETIC','Order ID':id,'B/S':' '+side,Contract:'MESM6',Product:'MES','Product Description':'Synthetic index',avgPrice:avg,filledQty:avg?'1':'','Fill Time':avg?`01/05/2026 10:${id==='101'?'01':'09'}:00`:'',lastCommandId:id==='106'?'306':id,Status:avg?' Filled':' Canceled',_priceFormat:'-2',_priceFormatType:'0',_tickSize:'0.25','Version ID':id==='106'?'306':id,Timestamp:`01/05/2026 10:${minute}:00`,Date:'01/05/26',Quantity:'1',Text:id==='105'?'DOM':'Chart',Type:' '+type,'Limit Price':type==='Limit'?'6005.00':'','Stop Price':type==='Stop'?'5990.00':'',decimalLimit:type==='Limit'?'6005.0':'',decimalStop:type==='Stop'?'5990.0':'','Filled Qty':avg?'1':'','Avg Fill Price':avg?avg+'.00':'',decimalFillAvg:avg,Currency:'USD'
  }));
  const fills=[['501','101','0','Buy','01','6000','123456789'],['502','102','1','Sell','09','6005','987654321']].map(([id,oid,action,side,minute,price,fraction])=>({_id:id,_orderId:oid,_contractId:'81',_timestamp:`2026-01-05 10:${minute}:00.${fraction}Z`,_tradeDate:'2026-01-05',_action:action,_qty:'1',_price:price+'.0',_active:'true',_accountId:'71','Fill ID':id,'Order ID':oid,Timestamp:`01/05/2026 10:${minute}:00`,Date:'01/05/26',Account:'DEMO-SYNTHETIC','B/S':' '+side,Quantity:'1',Price:price+'.00',_priceFormat:'-2',_priceFormatType:'0',_tickSize:'0.25',Contract:'MESM6',Product:'MES','Product Description':'Synthetic index',commission:'0.50'}));
  return {orders,fills};
}
export const selected={...selection,contractSymbol:undefined,quantity:1,entry:6000,exit:6005,buyFillId:'501',sellFillId:'502'};
export const window={startDate:'2026-01-05',endDate:'2026-01-06'};
export function detailDescriptors(){return [...archiveDescriptors(),{name:'Order Details',params:[{name:'order',paramType:'orders',optional:false}]},{...archiveDescriptors()[1],name:'Position History'}];}
export async function details(options={}){
  const data=observed();options.change?.(data);
  return archive({...options,mutate(d){d[definitionsPath]={reports:detailDescriptors()};options.mutate?.(d)},response:{[reportPath]:init=>{
    const {name}=JSON.parse(init.body);
    return json({data:name==='Orders'?csv(orderHeaders,data.orders):name==='Fills'?csv(fillHeaders,data.fills):'opaque synthetic report\nnot interpreted\n'});
  },...options.response}});
}
