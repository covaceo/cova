import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { clearCookie } from "../_lib/cookies.js";
import { deleteAuthUser, deleteBrokerConnectionsForUser } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    await deleteBrokerConnectionsForUser(user.id);
    await deleteAuthUser(user.id);

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Clear-Site-Data", '"cache", "cookies", "storage"');
    res.setHeader("Set-Cookie", [
      clearCookie("cova_projectx_connection"),
      clearCookie("cova_tradovate_connection"),
      clearCookie("cova_oauth_context"),
    ]);
    return res.status(200).json({ deleted: true });
  } catch (error) {
    return sendApiError(res, error, "Cova could not complete account deletion.");
  }
}
