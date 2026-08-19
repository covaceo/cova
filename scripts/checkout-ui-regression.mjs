import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");
const checkoutPath = join(root, "src", "components", "CheckoutPage.tsx");
const billingClientPath = join(root, "src", "lib", "billing.ts");
const checkoutBrowserPath = join(root, "scripts", "checkout-browser-regression.mjs");

assert.equal(existsSync(checkoutPath), true, "Cova must ship a customer-facing checkout page.");
assert.equal(existsSync(billingClientPath), true, "Cova must ship a browser billing client.");
assert.equal(existsSync(checkoutBrowserPath), true, "Checkout must have a rendered desktop/mobile browser regression.");

const app = read("src", "App.tsx");
const appRoutes = read("src", "lib", "appRoutes.ts");
const checkout = read("src", "components", "CheckoutPage.tsx");
const billingClient = read("src", "lib", "billing.ts");
const planSections = read("src", "components", "PlanSections.tsx");
const vercel = read("vercel.json");
const envExample = read(".env.example");
const packageJson = JSON.parse(read("package.json"));

assert.match(appRoutes, /"checkout"/, "Checkout must be a real hash route.");
assert.match(appRoutes, /protectedSections[\s\S]*"checkout"/, "Checkout must require an authenticated member.");
assert.match(app, /import \{ CheckoutPage \}/, "App must own the checkout route.");
assert.match(app, /section === "checkout"[\s\S]*?<CheckoutPage/, "App must render the Cova checkout surface.");
assert.match(app, /function upgradeToPro\(\)[\s\S]*?go\("checkout"\)/, "Upgrade actions must route into Cova checkout instead of a raw payment link.");
assert.doesNotMatch(app, /getProCheckoutUrl|VITE_STRIPE_PRO_PAYMENT_LINK|VITE_STRIPE_CHECKOUT_URL/, "The browser must not rely on an unauthenticated raw Payment Link.");
assert.match(planSections, /billingPrice/, "Pricing must show the Stripe Price returned by Cova's server.");
assert.match(checkout, /Review Cova Pro/, "Checkout needs a direct order-review heading.");
assert.match(checkout, /renews automatically/i, "Checkout must disclose recurring billing before payment.");
assert.match(checkout, /type="checkbox"[\s\S]*I understand Cova Pro renews automatically at \{recurringLabel\} until I cancel\./i, "Checkout must require explicit acknowledgement of the recurring charge.");
assert.match(checkout, /Stripe handles payment details/i, "Checkout must disclose the payment processor boundary.");
assert.match(checkout, /Terms[\s\S]*Privacy/, "Checkout must link the billing decision to Terms and Privacy.");
assert.match(checkout, /Manage billing/, "Active Pro members need a customer billing control.");
assert.match(billingClient, /authorizedFetch\("\/api\/billing\/checkout"/, "Checkout creation must use the authenticated server endpoint.");
assert.match(billingClient, /authorizedFetch\("\/api\/billing\/status"/, "Checkout completion must refresh authoritative server entitlement.");
assert.match(billingClient, /authorizedFetch\("\/api\/billing\/portal"/, "Billing management must use the authenticated server endpoint.");
assert.match(vercel, /\/api\/billing\/checkout[\s\S]*action=checkout/, "Vercel must route checkout through the shared billing function.");
assert.match(vercel, /\/api\/billing\/webhook[\s\S]*billing-webhook/, "Vercel must route Stripe events to the raw-body Web Handler.");
for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_PRICE_ID"]) {
  assert.match(envExample, new RegExp(`^${name}=`, "m"), `${name} must be documented for deployment.`);
}
assert.doesNotMatch(envExample, /VITE_STRIPE_SECRET|VITE_STRIPE_WEBHOOK/, "Stripe secrets must never be browser-visible.");
assert.match(packageJson.scripts.test, /test:billing[\s\S]*test:checkout-ui[\s\S]*test:checkout-browser/, "The canonical suite must include billing plus source and rendered checkout contracts.");
assert.equal(packageJson.scripts["test:checkout-browser"], "node scripts/checkout-browser-regression.mjs");

console.log("checkout-ui-regression: direct-purchase route, recurring disclosure, authenticated billing APIs, and Stripe routing passed");
