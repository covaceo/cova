import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
const css=readFileSync('src/styles/mobileWorkspace.css','utf8').replaceAll('\r\n','\n');
const approved=`  .oa-dashboard-app .workspace-top-header .operator-mobile-menu-panel {
    border-radius: 14px !important;
    /* The dropdown floats; its fading presence must not grow the opaque header. */
    position: absolute;
    top: calc(100% - 10px);
    left: 16px;
    right: 16px;
    /* Motion owns transform/opacity, not the inherited glass CSS transition. */
    transition: none;
  }`;
test('only the approved mobile menu positioning and transition declarations change',()=>{
 assert.equal(css.split(approved).length,2);
 const original=css.replace(approved,'  .oa-dashboard-app .workspace-top-header .operator-mobile-menu-panel { border-radius: 14px !important; }');
 assert.equal(createHash('sha256').update(original).digest('hex'),'ad40ec06110c401e70632c3fd22abda1ecbac229d4aec38bd01624a3e72972f2');
});
test('the dropdown floats under the existing header only inside the mobile workspace breakpoint',()=>{
 const rules=[];postcss.parse(css).walkRules('.oa-dashboard-app .workspace-top-header .operator-mobile-menu-panel',r=>{if(r.nodes.some(n=>n.prop==='position'))rules.push(r);});
 assert.equal(rules.length,1);const rule=rules[0];assert.equal(rule.parent.name,'media');assert.equal(rule.parent.params,'(max-width: 850px)');
 assert.deepEqual(Object.fromEntries(rule.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value])),{'border-radius':'14px',position:'absolute',top:'calc(100% - 10px)',left:'16px',right:'16px',transition:'none'});
});
test('normal motion browser checks are reachable from the canonical layout gate',()=>{
 const {scripts}=JSON.parse(readFileSync('package.json','utf8'));assert(scripts['test:layout'].includes('npm run test:mobile-menu-motion'));assert(scripts['test:mobile-menu-motion'].includes('scripts/mobile-menu-motion-browser.mjs'));
});
