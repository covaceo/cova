import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import load from './helpers/load-ts.cjs';
const source='src/lib/userProfile.ts';
test('usernames normalize to one lowercase ASCII identity',()=>{
 assert.ok(existsSync(source),'user profile rules must exist');
 const {normalizeUsername,validateUsername}=load(source);
 for(const input of ['lino','Lino',' @LINO ']) assert.equal(normalizeUsername(input),'lino');
 for(const name of ['lino','raf_123','abc','a'.repeat(24)]) assert.equal(validateUsername(name),null,name);
 for(const name of ['ab','a'.repeat(25),'with space','lino@mail.com','linó','a-b','a.b','@@lino','<script>']) assert.ok(validateUsername(name),name);
});
test('avatars and API errors are bounded and never interpreted as markup',()=>{
 const rules=load(source);
 assert.equal(typeof rules.validateAvatarData,'function','avatar guard must exist');
 assert.equal(rules.validateAvatarData(null),null);
 assert.equal(rules.validateAvatarData('data:image/jpeg;base64,/9j/2Q=='),null);
 for(const data of ['https://tracker.example/a','data:image/svg+xml,<svg/>','data:text/html,<script>', 'data:image/jpeg;base64,'+'a'.repeat(100001)]) assert.ok(rules.validateAvatarData(data));
 assert.match(rules.profileErrorMessage({code:'23505'}),/already taken/i);
 assert.doesNotMatch(rules.profileErrorMessage({message:'PRIVATE DB DETAIL'}),/PRIVATE/);
});
