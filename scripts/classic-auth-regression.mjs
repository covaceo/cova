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
  assert.match(source, /consumeSupabasePasswordRecoveryEvent\(event: string, accessToken: string\)/);
  assert.match(source, /initialAuthCallback\.accessToken === accessToken/);
  assert.match(source, /hasSupabasePasswordRecoveryCallbackMarker/);
  assert.match(source, /shouldCreateUser:\s*false/);
  assert.doesNotMatch(source, /shouldCreateUser:\s*mode\s*===/);
});

test("signup confirmation stays non-enumerating and never falsely guarantees email delivery", () => {
  const client = read("src", "lib", "supabaseClient.ts");

  const panels = read("src", "components", "AuthPanels.tsx");
  assert.doesNotMatch(`${client}\n${panels}`, /identities[\s\S]{0,120}length\s*===\s*0/);
  assert.doesNotMatch(panels, /An account already exists for this email/);
  assert.match(panels, /Check your email\. If nothing arrives, sign in or reset your password\./);
  assert.doesNotMatch(panels, /We sent a verification link/);
  assert.doesNotMatch(panels, />Email sent</);
  assert.match(panels, />Email requested</);
  assert.match(panels, /If this email can receive a verification link[\s\S]*If nothing arrives, sign in or reset your password instead\./);
  assert.match(panels, />Sign in instead</);
  assert.match(panels, />Reset password</);
  assert.match(panels, /If an email is available for this request, it is on the way\./);
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

test("ordinary email callbacks require their exact captured bearer", () => {
  const source = read("src", "lib", "supabaseClient.ts");
  assert.match(source, /export function isSupabaseAuthCallback\(accessToken: string\)/);
  assert.match(source, /initialAuthCallback\.accessToken === accessToken/);
  const appSource = read("src", "App.tsx");
  const authority = appSource.match(/function hasOrdinarySupabaseAuthAuthority\(session: SupabaseSession\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(authority, /isSupabaseAuthCallback\(session\.access_token\)/);
  assert.doesNotMatch(authority, /readAuthIntent/, "Attacker-controlled auth intent storage cannot authorize an ambient provider session.");
});

test("a matching implicit recovery callback is consumed before generic SIGNED_IN handling", () => {
  const clientSource = read("src", "lib", "supabaseClient.ts");
  const appSource = read("src", "App.tsx");
  const readCallback = clientSource.match(/function readInitialAuthCallback\(\) \{[\s\S]*?\n\}/)?.[0];
  const checkCallback = clientSource.match(/export function isSupabasePasswordRecoveryCallback\(accessToken: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "")
    .replace("accessToken: string", "accessToken");
  const consumeCallback = clientSource.match(/export function consumeSupabasePasswordRecoveryCallback\(accessToken: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "")
    .replace("accessToken: string", "accessToken");
  const checkMismatch = clientSource.match(/export function hasMismatchedSupabasePasswordRecoveryCallback\(accessToken: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "")
    .replace("accessToken: string", "accessToken");
  const consumeProof = clientSource.match(/function consumeSupabasePasswordRecoveryProof\(proven: boolean, accessToken: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("proven: boolean, accessToken: string", "proven, accessToken");
  const classifyEvent = clientSource.match(/export function consumeSupabasePasswordRecoveryEvent\(event: string, accessToken: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "")
    .replace("event: string", "event")
    .replace("accessToken: string", "accessToken");
  assert.ok(readCallback && checkCallback && checkMismatch && consumeProof && consumeCallback && classifyEvent, "Recovery event helpers must be extractable.");

  const createCheck = (hash) => {
    const context = { URLSearchParams, window: { location: { hash, search: "" } } };
    runInNewContext(`${readCallback}\nconst initialAuthCallback = readInitialAuthCallback();\nconst consumedPasswordRecoveryAccessTokens = new Set();\n${checkCallback}\n${checkMismatch}\n${consumeProof}\n${consumeCallback}\n${classifyEvent}\nthis.check = consumeSupabasePasswordRecoveryEvent; this.mismatch = hasMismatchedSupabasePasswordRecoveryCallback;`, context);
    return context;
  };

  const implicit = createCheck("#type=recovery&access_token=token-a");
  assert.equal(implicit.mismatch("token-b"), true);
  assert.equal(implicit.check("SIGNED_IN", "token-a"), true);
  assert.equal(implicit.mismatch("token-b"), false, "the captured bearer stops blocking refreshes after valid recovery proof is consumed");
  assert.equal(implicit.check("SIGNED_IN", "token-a"), false, "the same generic event must not reopen recovery after the callback is consumed");
  assert.equal(createCheck("#type=recovery&access_token=token-a").check("SIGNED_IN", "token-b"), false);
  assert.equal(createCheck("#type=recovery&access_token=token-a").check("PASSWORD_RECOVERY", "token-b"), false, "a live recovery event cannot replace a different captured callback bearer");
  assert.equal(createCheck("").check("PASSWORD_RECOVERY", "token-a"), true);

  const listenerStart = appSource.indexOf("client.auth.onAuthStateChange");
  const blockedCheck = appSource.indexOf("if (providerSessionsBlockedRef.current)", listenerStart);
  const recoveryCheck = appSource.indexOf("consumeSupabasePasswordRecoveryEvent(event, session.access_token)", listenerStart);
  const genericSignedIn = appSource.indexOf('event === "SIGNED_IN"', listenerStart);
  assert.ok(blockedCheck > -1 && recoveryCheck > blockedCheck && genericSignedIn > recoveryCheck, "Bearer-bound recovery classification must run after the blocked latch and before generic SIGNED_IN handling.");
});

test("an origin-scoped recovery marker survives reload and stays bound to one Supabase auth session", () => {
  const source = read("src", "lib", "supabaseClient.ts");
  const appSource = read("src", "App.tsx");
  assert.match(source, /COVA_SUPABASE_RECOVERY_STORAGE_KEY = "cova-supabase-recovery-v1"/);
  assert.match(source, /claims\.session_id/);
  assert.match(source, /localStorage\.setItem\(COVA_SUPABASE_RECOVERY_STORAGE_KEY/);
  assert.match(source, /localStorage\.removeItem\(COVA_SUPABASE_RECOVERY_STORAGE_KEY/);
  assert.doesNotMatch(source, /expiresAt/, "Recovery continuity must not silently expire into ordinary workspace auth.");

  const getSessionStart = appSource.indexOf("client.auth.getSession()");
  const mismatchInitial = appSource.indexOf("rejectMismatchedPasswordRecoverySession(session)", getSessionStart);
  const persistedInitial = appSource.indexOf("isPersistedSupabasePasswordRecoverySession(session.access_token, session.user.id)", mismatchInitial);
  const initialValidation = appSource.indexOf("startSupabaseValidation(session)", getSessionStart);
  const listenerStart = appSource.indexOf("client.auth.onAuthStateChange");
  const mismatchEvent = appSource.indexOf("rejectMismatchedPasswordRecoverySession(session)", listenerStart);
  const persistedEvent = appSource.indexOf("isPersistedSupabasePasswordRecoverySession(session.access_token, session.user.id)", mismatchEvent);
  const eventValidation = appSource.indexOf("startSupabaseValidation(session)", listenerStart);
  assert.ok(mismatchInitial > getSessionStart && mismatchInitial < persistedInitial && persistedInitial < initialValidation, "Invalid recovery state must be rejected before initial restoration or ordinary validation.");
  assert.ok(mismatchEvent > listenerStart && mismatchEvent < persistedEvent && persistedEvent < eventValidation, "Invalid recovery state must be rejected before auth-event restoration or ordinary validation.");
  assert.match(appSource, /function beginPasswordRecovery[\s\S]*rememberSupabasePasswordRecoverySession\(session\.access_token, session\.user\.id\)/);
  assert.match(appSource, /function beginPasswordRecovery[\s\S]*if \(!clearOrdinarySupabaseAuthAuthority\(\)\)[\s\S]*lockSupabaseLocally\(\)[\s\S]*lockWorkspace\(false\)[\s\S]*return/);
  assert.match(appSource, /function rejectUnprovenSupabaseSession[\s\S]*hasOrdinarySupabaseAuthAuthority\(session\)[\s\S]*lockSupabaseLocally\(\)[\s\S]*lockWorkspace\(false\)/);
  assert.match(appSource, /rejectUnprovenSupabaseSession\(session\)[\s\S]*startSupabaseValidation\(session\)/);
  assert.match(appSource, /function beginPasswordRecovery[\s\S]*if \(!rememberSupabasePasswordRecoverySession[\s\S]*lockSupabaseLocally\(\)[\s\S]*lockWorkspace\(false\)[\s\S]*return/);
  assert.match(appSource, /const activeRecoveryMismatch = Boolean\([\s\S]*!isPersistedSupabasePasswordRecoverySession\(session\.access_token, session\.user\.id\)/);
  assert.match(appSource, /function finishPasswordRecovery[\s\S]*clearPersistedSupabasePasswordRecoverySession\(\)[\s\S]*startSupabaseValidation\(session\)/);
  assert.match(appSource, /function lockWorkspace[\s\S]*clearPersistedSupabasePasswordRecoverySession\(\)/);

  const readMarker = source.match(/function readSupabasePasswordRecoverySession\(\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace(/ as \{ fingerprint\?: unknown; userId\?: unknown \} \| null/, "")
    .replace(/ as \{ session_id\?: unknown \}/, "");
  const sessionId = source.match(/export function getSupabaseAuthSessionId\(accessToken: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "")
    .replace("accessToken: string", "accessToken")
    .replace(/ as \{ session_id\?: unknown \}/, "");
  const fingerprint = source.match(/function supabaseRecoverySessionFingerprint\(accessToken: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("accessToken: string", "accessToken")
    .replace(/ as \{ session_id\?: unknown \}/, "");
  const remember = source.match(/export function rememberSupabasePasswordRecoverySession\(accessToken: string, userId: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "")
    .replace("accessToken: string, userId: string", "accessToken, userId");
  const hasMarker = source.match(/export function hasPersistedSupabasePasswordRecoverySession\(\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "");
  const matches = source.match(/export function isPersistedSupabasePasswordRecoverySession\(accessToken: string, userId: string\) \{[\s\S]*?\n\}/)?.[0]
    ?.replace("export ", "")
    .replace("accessToken: string, userId: string", "accessToken, userId");
  assert.ok(readMarker && sessionId && fingerprint && remember && hasMarker && matches, "Durable recovery helpers must be executable.");
  const storage = new Map();
  const context = {
    atob,
    JSON,
    COVA_SUPABASE_RECOVERY_STORAGE_KEY: "cova-supabase-recovery-v1",
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  runInNewContext(`${readMarker}\n${sessionId}\n${fingerprint}\n${remember}\n${hasMarker}\n${matches}\nthis.remember = rememberSupabasePasswordRecoverySession; this.has = hasPersistedSupabasePasswordRecoverySession; this.matches = isPersistedSupabasePasswordRecoverySession;`, context);
  const jwt = (sessionId, signature) => `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url")}.${signature}`;
  const first = jwt("recovery-session", "first-signature");
  const refreshed = jwt("recovery-session", "refreshed-signature");
  assert.equal(context.remember(first, "user-A"), true);
  assert.equal(context.has(), true);
  assert.equal(context.matches(refreshed, "user-A"), true, "Token refresh in the same Supabase auth session must preserve recovery.");
  assert.equal(context.matches(jwt("other-session", "other-signature"), "user-A"), false, "A second login session for the same user must not inherit recovery.");
  assert.equal(context.matches(refreshed, "user-B"), false);
  assert.equal(context.remember(jwt("", "signature-secret"), "user-A"), false, "Recovery persistence requires a Supabase session_id and must not fall back to the JWT signature.");
  const persisted = storage.get("cova-supabase-recovery-v1");
  assert.doesNotMatch(persisted, /first-signature|refreshed-signature|header\./, "Durable recovery state must never store a bearer token.");
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
  assert.match(source, /submitCredentials[\s\S]*saveAuthIntent\(mode\)/);
  assert.match(source, /emailLoginLink[\s\S]*saveAuthIntent\("login"\)/);
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
  assert.match(source, /consumeSupabasePasswordRecoveryEvent\(event, session\.access_token\)/);
  assert.match(source, /consumeSupabasePasswordRecoveryCallback\(session\.access_token\)/);
  assert.doesNotMatch(source, /isSupabasePasswordRecoveryCallback\(\)/);
  assert.match(source, /beginPasswordRecovery/);
  assert.match(source, /passwordRecoveryUserIdRef/);
  assert.match(source, /finishPasswordRecovery/);
  assert.match(source, /passwordRecovery=\{Boolean\(passwordRecoverySession\)\}/);
  assert.match(source, /onPasswordRecovered=\{finishPasswordRecovery\}/);
  assert.match(source, /function finishPasswordRecovery[\s\S]*if \(!clearPersistedSupabasePasswordRecoverySession\(\)\)[\s\S]*lockSupabaseLocally\(\)[\s\S]*lockWorkspace\(false\)[\s\S]*return[\s\S]*startSupabaseValidation\(session\)/);
  assert.match(source, /function isCurrentPasswordRecoveryTask[\s\S]*isPersistedSupabasePasswordRecoverySession\(session\.access_token, session\.user\.id\)/);
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
  const recoveryEvent = source.indexOf("consumeSupabasePasswordRecoveryEvent(event, session.access_token)", source.indexOf("onAuthStateChange"));
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
