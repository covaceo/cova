// Run workspace-browser-fixture.mjs first. All traffic stays on localhost.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const out = "/workspace/cova-source-recovery/browser-evidence";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const contexts = [];
const errors = [];
const receipts = [];
const A = crypto.randomUUID(),
  B = crypto.randomUUID();
const page = async (owner = A, mobile = false) => {
  const c = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
    isMobile: mobile,
  });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto("http://127.0.0.1:4179/__workspace?owner=" + owner);
  return p;
};
const phase = (p, v) =>
  p.waitForFunction((v) => window.__sync?.phase === v, v, { timeout: 15000 });
const settle = async (p) => {
  await p.waitForTimeout(750);
  await phase(p, "saved");
};
try {
  const desktop = await page();
  await phase(desktop, "review");
  assert.equal(await desktop.evaluate(() => window.__rows.length), 0);
  await desktop
    .getByRole("button", { name: "Back up and copy browser changes" })
    .click();
  await phase(desktop, "saved");
  await desktop.getByRole("button", { name: "Add synthetic trade" }).click();
  await settle(desktop);
  await desktop.getByRole("button", { name: "Set loss limit" }).click();
  await settle(desktop);
  await desktop
    .getByLabel("Trade account", { exact: true })
    .selectOption("local");
  await desktop
    .getByLabel("Journal note", { exact: true })
    .fill("Synthetic daily A — local candidate only");
  await desktop.getByRole("button", { name: "Save note", exact: true }).click();
  await settle(desktop);
  receipts.push("desktop opt-in, trade/rules/journal saved");
  const phone = await page(A, true);
  await phase(phone, "saved");
  assert.equal(await phone.evaluate(() => window.__rows.length), 1);
  assert.equal(await phone.evaluate(() => window.__rows[0].notes), "Trade A");
  assert.equal(
    await phone.evaluate(
      () => window.__rules.find((r) => r.metric === "maxDailyLoss").limit,
    ),
    1250,
  );
  assert.equal(
    await phone.getByLabel("Journal note", { exact: true }).inputValue(),
    "",
  );
  await phone
    .getByLabel("Trade account", { exact: true })
    .selectOption("local");
  await phone.waitForFunction(
    () =>
      document.querySelector('[aria-label="Journal note"]').value ===
      "Synthetic daily A — local candidate only",
  );
  await phone.screenshot({ path: out + "/phone-restore.png", fullPage: true });
  receipts.push(
    "fresh phone restores trade, note, loss limit, and correctly scoped daily note",
  );
  await phone.getByLabel("Trade account", { exact: true }).selectOption("all");
  await phone
    .getByLabel("Journal note", { exact: true })
    .fill("Distinct all-scoped note");
  await phone.getByRole("button", { name: "Save note", exact: true }).click();
  await settle(phone);
  await phone
    .getByLabel("Trade account", { exact: true })
    .selectOption("local");
  assert.equal(
    await phone.getByLabel("Journal note", { exact: true }).inputValue(),
    "Synthetic daily A — local candidate only",
  );
  receipts.push("all/local notes remain distinct");
  await phone.getByLabel("Journal note", {exact:true}).fill("");
  await phone.getByRole("button", {name:"Save note",exact:true}).click();
  await settle(phone);
  await phone.getByLabel("Journal note", {exact:true}).fill("Recreated daily note");
  await phone.getByRole("button", {name:"Save note",exact:true}).click();
  await phase(phone,"review");
  await phone.getByRole("button",{name:"Back up and copy browser changes"}).click();
  await phase(phone,"saved");
  const recreated = await page(A,true);await phase(recreated,"saved");
  await recreated.getByLabel("Trade account",{exact:true}).selectOption("local");
  assert.equal(await recreated.getByLabel("Journal note",{exact:true}).inputValue(),"Recreated daily note");
  receipts.push("clear/sync/re-enter same-account/date explicitly recreates daily note and fresh device restores it");
  const other = await page(B, true);
  await phase(other, "review");
  assert.equal(await other.evaluate(() => window.__rows.length), 0);
  assert.equal(
    await other.getByLabel("Journal note", { exact: true }).inputValue(),
    "",
  );
  receipts.push("fresh owner B sees no A ledger or notes");
  // Reload desktop to acknowledge phone's unrelated journal row before conflict test.
  await desktop
    .getByRole("button", { name: "Reload account and review" })
    .click();
  await phase(desktop, "saved");
  await desktop.evaluate(() => window.__setNote("Desktop edit"));
  await settle(desktop);
  await phone.evaluate(() => window.__setNote("Conflicting phone edit"));
  await phase(phone, "error");
  assert.equal(
    await phone.evaluate(() => window.__rows[0].notes),
    "Conflicting phone edit",
  );
  receipts.push("stale phone edit conflicts and retains browser draft");
  await phone
    .getByRole("button", { name: "Reload account and review" })
    .click();
  await phase(phone, "review");
  assert(
    (await phone.evaluate(() => window.__sync.preview.conflicts.length)) > 0,
  );
  await phone
    .getByRole("button", { name: "Back up and copy browser changes" })
    .click();
  await phase(phone, "saved");
  receipts.push("explicit conflict choice saves after verified backup");
  // Unsaved journal draft cannot be silently discarded by account selection.
  await phone.getByLabel("Journal note", { exact: true }).fill("Unsaved");
  phone.removeAllListeners("dialog");
  phone.on("dialog", (d) => d.dismiss());
  await phone.getByLabel("Trade account", { exact: true }).selectOption("all");
  assert.equal(
    await phone.getByLabel("Trade account", { exact: true }).inputValue(),
    "local",
  );
  assert.equal(
    await phone.getByLabel("Journal note", { exact: true }).inputValue(),
    "Unsaved",
  );
  receipts.push("account switch cancellation preserves unsaved journal draft");
  const fresh = await page(A);
  await phase(fresh, "saved");
  assert.equal(
    await fresh.evaluate(() => window.__rows[0].notes),
    "Conflicting phone edit",
  );
  assert.equal(
    await fresh.evaluate(() =>
      Object.keys(localStorage).some(
        (k) =>
          k.startsWith("cova-manual-net") ||
          k.startsWith("cova-recap-ingestion"),
      ),
    ),
    false,
  );
  receipts.push(
    "new device receives edited ledger without invented provenance",
  );
  await fresh.request.get("http://127.0.0.1:4179/__offline");
  await fresh.evaluate(() => window.__setNote("Offline draft survives"));
  await phase(fresh, "error");
  assert.equal(
    await fresh.evaluate(() => window.__rows[0].notes),
    "Offline draft survives",
  );
  await fresh.request.get("http://127.0.0.1:4179/__offline");
  await fresh
    .getByRole("button", { name: "Reload account and review" })
    .click();
  await phase(fresh, "saved");
  const afterOffline = await page(A, true);
  await phase(afterOffline, "saved");
  assert.equal(
    await afterOffline.evaluate(() => window.__rows[0].notes),
    "Offline draft survives",
  );
  receipts.push("offline pending save survives and replays to another device");

  assert.deepEqual(errors, []);
  await writeFile(
    out + "/receipt.json",
    JSON.stringify({ passed: true, receipts, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, receipts }, null, 2));
} catch (e) {
  for (let i = 0; i < contexts.length; i++) {
    const p = contexts[i].pages()[0];
    await p
      .screenshot({ path: out + "/failure-" + i + ".png", fullPage: true })
      .catch(() => {});
    console.log(
      "page",
      i,
      await p
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  throw e;
} finally {
  await browser.close();
}
