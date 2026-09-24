import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
const source=new URL('../api/passport.ts',import.meta.url),file=new URL('../api/.passport-native-'+randomUUID()+'.mjs',import.meta.url);
try {const code=ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;writeFileSync(file,code);const {default:handler}=await import(file.href);let status,body;await handler({method:'PATCH'},{setHeader(){},status(n){status=n;return this},json(v){body=v}});assert.equal(status,405);assert.equal(body.error,'Method not allowed');console.log('PASS native Node ESM startup and method guard, without a bundler masking import resolution');}finally{try{unlinkSync(file)}catch{}}
