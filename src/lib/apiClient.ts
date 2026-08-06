import { isRithmicUiPreview } from "./authEnvironment";
import { getSupabaseClient } from "./supabaseClient";

function previewJson(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function previewRequest(input: RequestInfo | URL, init: RequestInit) {
  const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
  const url = new URL(raw, window.location.origin);
  const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  return {
    method,
    path: url.pathname,
    sameOrigin: url.origin === window.location.origin,
  };
}

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const preview = previewRequest(input, init);
  if (isRithmicUiPreview() && preview.sameOrigin) {
    if (preview.path === "/api/rithmic/status" && preview.method === "GET") {
      return previewJson({ available: true, environment: "Test", preview: true });
    }
    if (preview.path === "/api/rithmic/sync" && preview.method === "POST") {
      return previewJson({
        provider: "Rithmic",
        preview: true,
        credentialsStored: false,
        counts: { rawFills: 0, trades: 0 },
      });
    }
  }

  const client = getSupabaseClient();
  const { data } = client ? await client.auth.getSession() : { data: { session: null } };
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Sign in to use secure account connections.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}
