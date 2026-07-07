import { parseCookies } from "../_lib/cookies.js";
import { decryptSecret } from "../_lib/encryption.js";
import {
  normalizeProjectXTrades,
  pickPrimaryAccount,
  PROJECTX_COOKIE,
  PROJECTX_PROVIDER,
  PROJECTX_PROVIDER_NAME,
  projectXPost,
  tradesToCsv,
} from "../_lib/projectx.js";
import { getBrokerConnection } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const connectionId = parseCookies(req)[PROJECTX_COOKIE];
  if (!connectionId) {
    res.status(401).json({ error: "Connect TopstepX before syncing trades." });
    return;
  }

  let token;
  try {
    const connection = await getBrokerConnection({ connectionId, provider: PROJECTX_PROVIDER });
    if (!connection?.access_token_encrypted) {
      res.status(404).json({ error: "TopstepX connection was not found in secure storage." });
      return;
    }
    token = decryptSecret(connection.access_token_encrypted);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not load the TopstepX connection." });
    return;
  }

  try {
    const accountResponse = await projectXPost("/Account/search", { onlyActiveAccounts: true }, token);
    const accounts = Array.isArray(accountResponse?.accounts) ? accountResponse.accounts : [];
    const requestedAccountId = req.query?.accountId ? Number(req.query.accountId) : null;
    const account = requestedAccountId
      ? accounts.find((item) => Number(item?.id) === requestedAccountId) || null
      : pickPrimaryAccount(accounts);

    if (!account?.id) {
      res.status(404).json({ error: "TopstepX connected, but no active trading account was returned." });
      return;
    }

    const endTimestamp = req.query?.endTimestamp || new Date().toISOString();
    const startTimestamp = req.query?.startTimestamp || new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString();
    const tradeResponse = await projectXPost("/Trade/search", {
      accountId: account.id,
      startTimestamp,
      endTimestamp,
    }, token);
    const rawTrades = Array.isArray(tradeResponse?.trades) ? tradeResponse.trades : [];
    const trades = normalizeProjectXTrades(rawTrades, account);

    res.status(200).json({
      provider: PROJECTX_PROVIDER_NAME,
      account: {
        id: account.id,
        name: account.name,
        balance: account.balance,
        simulated: account.simulated,
      },
      trades,
      csv: tradesToCsv(trades),
      counts: {
        accounts: accounts.length,
        rawTrades: rawTrades.length,
        trades: trades.length,
      },
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "TopstepX sync failed." });
  }
}
