import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cursorScreenshotDir = await mkdtemp(join(tmpdir(), "cova-cursor-release-"));

const preview = spawn(process.execPath, ["scripts/owned-vite-preview.mjs"], {
  env: process.env,
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
let previewOutput = "";
let previewError;
let readyMessage;
let origin = "";
preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
preview.once("error", (error) => { previewError = error; });
preview.on("message", (message) => {
  if (message?.type === "owned-preview-ready") readyMessage = message;
  if (message?.type === "owned-preview-error") previewError = new Error(message.message || "Owned preview failed.");
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForOwnedPreview(timeoutMs = 12_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (previewError) throw previewError;
    if (preview.exitCode !== null) throw new Error(`Owned preview exited before readiness.\n${previewOutput}`);
    if (readyMessage?.type === "owned-preview-ready" && Number.isInteger(readyMessage.port)) {
      origin = `http://127.0.0.1:${readyMessage.port}`;
      try {
        const response = await fetch(origin);
        if (response.ok) return;
        lastError = new Error(`${response.status} ${response.statusText}`);
      } catch (error) {
        lastError = error;
      }
    }
    await sleep(75);
  }
  throw new Error(`Owned preview did not become ready: ${lastError?.message || "no owned-preview-ready IPC event"}\n${previewOutput}`);
}

async function runNode(script, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, COVA_URL: origin, COVA_ROUTES: "", ...extraEnv },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with ${signal || `exit ${code}`}`));
    });
  });
}

async function waitForPreviewExit(timeoutMs = 5_000) {
  const started = Date.now();
  while (preview.exitCode === null && Date.now() - started < timeoutMs) await sleep(50);
  return preview.exitCode !== null;
}

async function waitForPortClosed(timeoutMs = 5_000) {
  if (!origin) return;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await fetch(origin, { signal: AbortSignal.timeout(250) });
    } catch {
      return;
    }
    await sleep(75);
  }
  throw new Error(`Owned preview port remained reachable after cleanup: ${origin}`);
}

async function terminatePreview() {
  if (preview.exitCode === null) {
    if (!preview.connected) throw new Error("Owned preview IPC disconnected before shutdown.");
    await new Promise((resolve, reject) => {
      preview.send({ type: "shutdown" }, (error) => error ? reject(error) : resolve());
    });
  }
  if (!await waitForPreviewExit()) {
    if (process.platform === "win32" && preview.pid) {
      await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(preview.pid), "/T", "/F"], async (error) => {
        if (!error || await waitForPreviewExit(1_000)) resolve();
        else reject(error);
      }));
    } else if (!preview.kill("SIGKILL")) {
      throw new Error("Owned preview process refused forced termination.");
    }
    if (!await waitForPreviewExit()) throw new Error("Owned preview process did not exit after forced termination.");
  }
  await waitForPortClosed();
}

try {
  await waitForOwnedPreview();
  await runNode("scripts/mobile-audit.mjs", {
    COVA_VIEWPORT_WIDTH: "390",
    COVA_VIEWPORT_HEIGHT: "844",
  });
  await runNode("scripts/mobile-audit.mjs", {
    COVA_VIEWPORT_WIDTH: "1440",
    COVA_VIEWPORT_HEIGHT: "900",
  });
  await runNode("scripts/dashboard-browser-regression.mjs");
  await runNode("scripts/auth-modal-browser-regression.mjs");
  await runNode("scripts/custom-cursor-browser-audit.mjs", {
    COVA_CURSOR_SCREENSHOT_DIR: cursorScreenshotDir,
  });
  console.log(`release-browser-regression: owned preview ${origin}; mobile, desktop, Dashboard lifecycle/accessibility, Practice transition, AuthSheet, and Windows cursor/performance checks passed`);
} finally {
  try {
    await terminatePreview();
  } finally {
    await rm(cursorScreenshotDir, { recursive: true, force: true });
  }
}
