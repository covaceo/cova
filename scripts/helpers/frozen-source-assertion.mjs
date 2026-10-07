import assert from 'node:assert/strict';import{createHash}from'node:crypto';
const textExtensions=new Set(['tsx','ts','jsx','js','mjs','cjs','css','json','html','svg','md']);
export function assertFrozenSource(path,source,expected){
 const raw=Buffer.isBuffer(source)?source:Buffer.from(source),variants=[raw];
 if(textExtensions.has(path.split('.').at(-1))){const lf=Buffer.from([...raw].filter((byte,index)=>!(byte===13&&raw[index+1]===10)));variants.push(lf,Buffer.from([...lf].flatMap(byte=>byte===10?[13,10]:[byte])));}
 const digests=variants.map(bytes=>createHash('sha256').update(bytes).digest('hex'));
 assert(digests.includes(expected),path+': source contents must equal the frozen baseline; only LF/CRLF checkout conversion is allowed. Expected '+expected+', actual variants '+digests.join(', '));
}
