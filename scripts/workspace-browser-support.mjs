import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const nativeChrome = process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/chromium';
const configuredChrome = process.env.CHROME_PATH || (existsSync(nativeChrome) ? nativeChrome : undefined);
export const workspaceBrowserOptions = {
  ...(configuredChrome ? { executablePath: configuredChrome } : {}),
  args: ['--no-sandbox'],
};
export function workspaceEvidence(name) {
  assert(/^[a-z0-9-]+$/.test(name), 'Use a bounded evidence subdirectory name');
  const base = process.env.COVA_WORKSPACE_EVIDENCE_DIR || join(process.env.TMPDIR || tmpdir(), 'cova-workspace-evidence');
  return join(base, name);
}
