import { clearCookie } from "../_lib/cookies.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.setHeader("Set-Cookie", [
    clearCookie("cova_projectx_connection"),
    clearCookie("cova_tradovate_connection"),
    clearCookie("cova_tradovate_oauth_state"),
    clearCookie("cova_tradovate_return_to"),
  ]);
  res.status(200).json({ ok: true });
}
