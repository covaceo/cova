import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

test("Supabase client exposes classic password signup, login, recovery, and safe passwordless fallback", () => {
  const source = read("src", "lib", "supabaseClient.ts");
  assert.match(source, /export async function signUpWithSupabasePassword/);
  assert.match(source, /client\.auth\.signUp\(\{[\s\S]*email,[\s\S]*password,[\s\S]*emailRedirectTo/);
  assert.match(source, /export async function signInWithSupabasePassword/);
  assert.match(source, /client\.auth\.signInWithPassword\(\{\s*email,\s*password\s*\}\)/);
  assert.match(source, /export async function sendSupabasePasswordReset/);
  assert.match(source, /client\.auth\.resetPasswordForEmail/);
  assert.match(source, /export async function verifySupabaseRecoveryIdentity\(accessToken: string, expectedUserId: string\)/);
  assert.match(source, /export async function updateSupabasePassword\(password: string, accessToken: string, expectedUserId: string\)/);
  assert.match(source, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(source, /client\.auth\.updateUser/);
  assert.match(source, /export async function resendSupabaseSignupConfirmation/);
  assert.match(source, /type:\s*["']signup["']/);
  assert.match(source, /export async function sendSupabaseLoginLink/);
  assert.match(source, /const initialAuthCallback = readInitialAuthCallback\(\)/);
  assert.match(source, /isSupabasePasswordRecoveryCallback\(accessToken: string\)/);
  assert.match(source, /initialAuthCallback\.accessToken === accessToken/);
  assert.match(source, /hasSupabasePasswordRecoveryCallbackMarker/);
  assert.match(source, /shouldCreateUser:\s*false/);
  assert.doesNotMatch(source, /shouldCreateUser:\s*mode\s*===/);
});

test("recovery callback detection requires the captured bearer", () => {
  const source = read("src", "lib", "supabaseClient.ts");
  const readCallback = source.match(/function readInitialAuthCallback\(\) \{[\s\S]*?\n\}/)?.[0];
  const checkCallback = source.match(/export function isSupabasePasswordRecoveryCallback\(accessToken: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "")
    .replace("accessToken: string", "accessToken");
  assert.ok(readCallback && checkCallback, "Recovery callback helpers must be extractable.");

  const evaluate = (search, hash, token) => {
    const context = { URLSearchParams, window: { location: { hash, search } } };
    runInNewContext(`${readCallback}\nconst initialAuthCallback = readInitialAuthCallback();\n${checkCallback}\nthis.check = isSupabasePasswordRecoveryCallback;`, context);
    return context.check(token);
  };

  assert.equal(evaluate("", "#type=recovery&access_token=token-a", "token-a"), true);
  assert.equal(evaluate("", "#type=recovery&access_token=token-a", "token-b"), false);
  assert.equal(evaluate("?type=recovery", "", "persisted-token"), false);
  assert.equal(evaluate("?type=recovery", "#type=signup&access_token=token-a", "token-a"), false);
});

test("auth UI uses conventional signup and login controls and language", () => {
  const source = read("src", "components", "AuthPanels.tsx");
  const styles = read("src", "styles", "operatorDossierRevamp.css");
  assert.match(source, /item === ["']login["'] \? ["']Sign in["'] : ["']Sign up["']/);
  assert.match(source, />Sign in</);
  assert.match(source, /Create account/);
  assert.match(source, /Forgot password\?/);
  assert.match(source, /Email me a sign-in link/);
  assert.match(source, /Check your email/);
  assert.match(source, /view === "email-sent"[\s\S]*\? "Check your email"/);
  assert.match(source, /view === "forgot-password"[\s\S]*\? "Reset Cova password"/);
  assert.match(source, /\[authOpen, view, pendingPolicyConfirmation, passwordRecovery\]/);
  assert.match(source, /Resend verification email/);
  assert.match(source, /Use another email/);
  assert.match(source, /disabled=\{authBusy\}[\s\S]{0,500}Use another email/);
  assert.match(source, /Set a new password/);
  assert.match(source, /await onUpdatePassword\(password\)/);
  assert.match(source, /credentialRequestInFlightRef\.current[\s\S]*providerAttemptId = onAuthAttemptStarted\(\)/);
  assert.match(source, /!onAuthSessionIsCurrent\(data\.session, providerAttemptId\)[\s\S]*await onDiscardAuthSession\(data\.session\)/);
  assert.match(source, /submitForgotPassword[\s\S]*saveAuthIntent\("login"\)[\s\S]*sendSupabasePasswordReset/);
  assert.match(source, /Show password/);
  assert.match(source, /autoComplete=\{isSignup \? ["']new-password["'] : ["']current-password["']\}/);
  assert.match(source, /I agree to the[\s\S]*Terms of Service[\s\S]*Privacy Policy/);
  assert.doesNotMatch(source, /Risk desk identity|Hosted member handoff|Send secure link|Start for free/);
  assert.doesNotMatch(source, /text-white\/(?:28|32|34|36|38|42|45)\b/);
  assert.match(source, /auth-account-tab terminal-tab/);
  assert.match(styles, /\.auth-account-tab:not\(\.terminal-tab-active\)[\s\S]*rgba\(255, 255, 255, 0\.65\) !important/);
});

test("password recovery callback cannot open the workspace before a new password is set", () => {
  const source = read("src", "App.tsx");
  assert.match(source, /PASSWORD_RECOVERY/);
  assert.match(source, /isSupabasePasswordRecoveryCallback\(session\.access_token\)/);
  assert.doesNotMatch(source, /isSupabasePasswordRecoveryCallback\(\)/);
  assert.match(source, /beginPasswordRecovery/);
  assert.match(source, /passwordRecoveryUserIdRef/);
  assert.match(source, /finishPasswordRecovery/);
  assert.match(source, /passwordRecovery=\{Boolean\(passwordRecoverySession\)\}/);
  assert.match(source, /onPasswordRecovered=\{finishPasswordRecovery\}/);
  assert.match(source, /verifySupabaseRecoveryIdentity\(session\.access_token, session\.user\.id\)[\s\S]*isCurrentPasswordRecoveryTask[\s\S]*updateSupabasePassword\(password, session\.access_token, session\.user\.id\)[\s\S]*isCurrentPasswordRecoveryTask/);
});

test("opening auth never clears the provider sign-out latch", () => {
  const source = read("src", "App.tsx");
  const openAuth = source.match(/const openAuth = useCallback\([\s\S]*?\}, \[\]\);/)?.[0] || "";
  assert.match(openAuth, /setAuthMode\(mode\)/);
  assert.match(openAuth, /useCallback/);
  assert.doesNotMatch(openAuth, /providerSessionsBlockedRef/);
  assert.match(source, /function startProviderAuthAttempt[\s\S]*providerSessionsBlockedRef\.current = false/);
  const blockedCheck = source.indexOf("if (providerSessionsBlockedRef.current)", source.indexOf("onAuthStateChange"));
  const recoveryEvent = source.indexOf('event === "PASSWORD_RECOVERY"', source.indexOf("onAuthStateChange"));
  assert.ok(blockedCheck > -1 && recoveryEvent > blockedCheck, "Provider events must be rejected before recovery is accepted.");
});

test("public auth actions use regular signup and login labels", () => {
  const button = read("src", "components", "StartFreeButton.tsx");
  const navbar = read("src", "components", "Navbar.tsx");
  const gate = read("src", "components", "AuthPanels.tsx");
  const footer = read("src", "components", "PlanSections.tsx");
  assert.match(button, /children = ["']Sign up["']/);
  assert.doesNotMatch(button, /Start(?: for)? free/i);
  assert.match(navbar, />\s*Sign in\s*</);
  assert.doesNotMatch(navbar, />\s*Login\s*</);
  assert.match(gate, />Sign in</);
  assert.doesNotMatch(footer, /Start(?: for)? free/i);
});

test("public legal copy accurately describes Supabase-managed password authentication", () => {
  const source = read("src", "components", "LegalPages.tsx");
  assert.match(source, /Supabase Auth for email and password authentication/i);
  assert.match(source, /Cova does not store member passwords/i);
  assert.doesNotMatch(source, /passwordless magic-link sign-in/i);
});
