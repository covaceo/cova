import { getSupabaseClient } from "./supabaseClient";

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
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
