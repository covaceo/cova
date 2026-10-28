import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, 'src/components', name), 'utf8');
const plainCopy = {
  'FeaturesShowcasePage.tsx': ['Notes linked to your trades', 'Trade and limit context', 'TRADES & LIMITS', 'SAMPLE LIMITS', 'COMPLETED TRADES'],
  'MarketingHero.tsx': ['Cova helps you review your trades, spot patterns, and see how you followed your rules.', 'Funded account summary', 'Size warning', 'Your size limit'],
  'ResourcesQuickStartPage.tsx': ['5 steps · completed trades', 'Cova reviews completed trades.', 'Choose privacy settings, then export the results you want to share.'],
  'PublicPassportExampleCard.tsx': ['NQ / ES · 25 trades'],
  'TradeProofThreeStory.tsx': ['Compare size across recent sessions.'],
  'PlanSections.tsx': ['Try Cova before you pay.', 'Start with 25 trades. Upgrade for unlimited imports and Passport exports.', 'Try Cova with a small set of trades.'],
  'landing/MinimalPlanPricing.tsx': ['Try Cova before you pay.', 'Start with 25 trades. Upgrade for unlimited imports and Passport exports.'],
};
for (const [file, expected] of Object.entries(plainCopy)) {
  test(`${file}: plain public copy`, () => {
    const source = read(file);
    for (const text of expected) assert.ok(source.includes(text), `${file} is missing: ${text}`);
    assert.doesNotMatch(source, /evidence-linked|live-trading permission|trade permission|retrospective summaries|reviewed history|completed history|review workflow|prove the workflow|Built for risk review, not trade signals/i);
  });
}
test('sample labels, product boundaries, pricing and vendor notices remain', () => {
  assert.ok(read('PublicPassportExampleCard.tsx').includes('Sample data · Not account verified'));
  assert.ok(read('StoryStrip.tsx').includes('Sample card · Not account verified'));
  assert.ok(read('FeaturesShowcasePage.tsx').includes('SAMPLE / NOT VERIFIED'));
  assert.ok(read('FeaturesShowcasePage.tsx').includes('They do not block orders or alter broker settings.'));
  assert.ok(read('FeaturesShowcasePage.tsx').includes('They are not financial advice or trade calls.'));
  assert.ok(read('ResourcesQuickStartPage.tsx').includes('Nothing imports until you confirm the file.'));
  assert.ok(read('landing/RiskDeskFeature.tsx').includes('Sample trades · USD · gross before fees.'));
  for (const text of ['price: "$0"', 'price: "$29"', '"month", "founding price"', '"No trade signals"', '"No auto-trading"', '"No brokerage order execution"', '"No payout guarantee"', '"No financial advice"']) assert.ok(read('PlanSections.tsx').includes(text), text);
  for (const file of ['ProviderResources.tsx', 'landing/ResourceLogoCloud.tsx']) {
    assert.ok(read(file).includes('Paid link'));
    assert.ok(read(file).includes('NinjaTrader® is a registered trademark of NinjaTrader Group, LLC.'));
  }
});
