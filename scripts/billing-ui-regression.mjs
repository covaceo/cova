import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
assert.ok(existsSync('src/components/Billing.tsx'),'dashboard-matched Billing component must exist');
const billing=readFileSync('src/components/Billing.tsx','utf8'),app=readFileSync('src/App.tsx','utf8'),profile=readFileSync('src/components/UserProfile.tsx','utf8');
assert.match(app,/BillingProvider/);assert.match(app,/openBilling/);assert.match(profile,/<BillingPanel/);
assert.match(billing,/ownerId/);assert.match(billing,/AbortController/);assert.match(billing,/Billing/);assert.match(billing,/Manage billing/);
assert.doesNotMatch(billing,/sk_test_|sk_live_|localStorage\.setItem/);
assert.match(readFileSync('api/billing.js','utf8'),/\['checkout','portal','cancel'\]/,'API must expose the authenticated cancel action');
console.log('PASS billing UI integration, owner-bound requests and secret-free source');
