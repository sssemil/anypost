#!/usr/bin/env node

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:5173";
const DEFAULT_RECORD_WAIT_MS = 195_000;
const DEFAULT_SETTLE_MS = 10_000;

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const webDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webDir, "../..");
const invocationCwd = process.env.INIT_CWD && process.env.INIT_CWD.trim().length > 0
  ? process.env.INIT_CWD
  : repoRoot;

const resolveUserPath = (inputPath) =>
  path.isAbsolute(inputPath) ? inputPath : path.resolve(invocationCwd, inputPath);

const nowStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {
    baseUrl: DEFAULT_BASE_URL,
    outDir: path.resolve(repoRoot, "artifacts", "headless-recordings", nowStamp()),
    noServer: false,
    headed: false,
    recordWaitMs: DEFAULT_RECORD_WAIT_MS,
    settleMs: DEFAULT_SETTLE_MS,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--") {
      continue;
    }
    if (arg === "--url" && next) {
      out.baseUrl = next;
      i += 1;
      continue;
    }
    if (arg === "--out-dir" && next) {
      out.outDir = resolveUserPath(next);
      i += 1;
      continue;
    }
    if (arg === "--record-wait-ms" && next) {
      out.recordWaitMs = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--settle-ms" && next) {
      out.settleMs = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--no-server") {
      out.noServer = true;
      continue;
    }
    if (arg === "--headed") {
      out.headed = true;
      continue;
    }
    throw new Error(`Unknown or incomplete arg: ${arg}`);
  }

  return out;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (message) => {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`[e2e ${stamp}] ${message}`);
};

const waitForHttp = async (url, timeoutMs) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      // Keep polling.
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const runCommand = (cmd, args, cwd) =>
  new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code}`));
      }
    });
  });

const startWebServer = async (baseUrl) => {
  log("Building anypost-core...");
  await runCommand("pnpm", ["--filter", "anypost-core", "build"], repoRoot);

  log("Starting Vite dev server...");
  const proc = spawn(
    "pnpm",
    ["--filter", "anypost-web", "exec", "vite", "--host", "127.0.0.1", "--port", "5173"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    },
  );

  await waitForHttp(baseUrl, 60_000);
  log("Dev server is reachable.");
  return proc;
};

const isVisible = async (locator, timeout = 1200) => {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
};

const ensureAccountReady = async (page, displayName) => {
  const createAccountButton = page.getByRole("button", { name: "Create New Account" });
  if (await isVisible(createAccountButton, 2500)) {
    await createAccountButton.click();
  }

  const displayInput = page.getByPlaceholder("Enter your display name...");
  if (await isVisible(displayInput, 10_000)) {
    await displayInput.fill(displayName);
    await page.getByRole("button", { name: "Continue" }).click();
  }

  await page.getByRole("button", { name: "Create" }).first().waitFor({ state: "visible", timeout: 90_000 });
};

const openMenu = async (page) => {
  await page.getByTitle("Menu").click();
};

const openDevTools = async (page) => {
  if (await isVisible(page.getByText("Developer Tools", { exact: true }), 800)) return;
  await openMenu(page);
  await page.getByRole("button", { name: "Developer Tools" }).click();
  await page.getByText("Developer Tools", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
};

const startRecorder = async (page, label) => {
  await openDevTools(page);
  const recordButton = page.getByRole("button", { name: "Record 3m" });
  await recordButton.waitFor({ state: "visible", timeout: 20_000 });
  await recordButton.click();
  log(`${label}: recorder started`);
};

const getOwnPeerId = async (page, label) => {
  await openDevTools(page);
  const networkPanel = page.locator("div.rounded-xl:has(strong:has-text(\"Network\"))").first();
  await networkPanel.waitFor({ state: "visible", timeout: 10_000 });
  const text = await networkPanel.innerText();
  const match = text.match(/PeerId\s+([1-9A-HJ-NP-Za-km-z]{32,})/);
  if (!match) {
    throw new Error(`${label}: failed to parse own peer ID from Network panel`);
  }
  return match[1];
};

const connectPeer = async (page, targetPeerId, label) => {
  await openDevTools(page);
  const peerPanel = page.locator("div.rounded-xl:has(strong:has-text(\"Peer Sharing\"))").first();
  await peerPanel.waitFor({ state: "visible", timeout: 10_000 });
  const connectInput = peerPanel.getByPlaceholder("12D3KooW...").first();
  await connectInput.fill(targetPeerId);
  await peerPanel.getByRole("button", { name: "Find & Connect" }).click();
  log(`${label}: Find & Connect -> ${targetPeerId.slice(0, 12)}...`);
};

const startDm = async (page, targetPeerId) => {
  const input = page.getByPlaceholder("Peer ID...").first();
  await input.fill(targetPeerId);
  await page.getByRole("button", { name: "Chat" }).first().click();
};

const createGroupAndCopyInvite = async (page, groupName) => {
  await page.getByRole("button", { name: "Create" }).first().click();

  const createInput = page.getByPlaceholder("Group name...");
  await createInput.fill(groupName);
  await createInput.press("Enter");

  await page.getByText("Create Invite", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Copy Invite Code" }).click();

  const inviteCode = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  });

  if (!inviteCode || inviteCode.trim().length < 40) {
    throw new Error("Failed to read invite code from clipboard");
  }
  return inviteCode.trim();
};

const joinViaInvite = async (page, inviteCode) => {
  await page.getByRole("button", { name: "Join" }).first().click();
  const joinInput = page.getByPlaceholder("Paste invite code...");
  await joinInput.fill(inviteCode);
  await joinInput.press("Enter");
};

const downloadRecorderFile = async (page, label, outDir, timeoutMs) => {
  await openDevTools(page);
  const downloadBtn = page.getByRole("button", { name: "Download Recording" });
  await downloadBtn.waitFor({ state: "visible", timeout: timeoutMs });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10_000 }),
    downloadBtn.click(),
  ]);
  const suggested = download.suggestedFilename();
  const ext = suggested.toLowerCase().endsWith(".json") ? ".json" : "";
  const basename = ext ? suggested.slice(0, -ext.length) : suggested;
  const targetPath = path.join(outDir, `${basename}-${label}${ext || ".json"}`);
  await download.saveAs(targetPath);
  return targetPath;
};

const main = async () => {
  const options = parseArgs();
  await mkdir(options.outDir, { recursive: true });

  let serverProc;
  const closeServer = () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill("SIGTERM");
    }
  };

  process.on("SIGINT", () => {
    closeServer();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    closeServer();
    process.exit(143);
  });

  if (!options.noServer) {
    serverProc = await startWebServer(options.baseUrl);
  } else {
    await waitForHttp(options.baseUrl, 10_000);
  }

  const browser = await chromium.launch({ headless: !options.headed });

  try {
    const aliceContext = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 900 },
    });
    const bobContext = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 900 },
    });
    await aliceContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.baseUrl });
    await bobContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.baseUrl });

    const alice = await aliceContext.newPage();
    const bob = await bobContext.newPage();

    log("Opening Alice/Bob pages...");
    await Promise.all([
      alice.goto(options.baseUrl, { waitUntil: "domcontentloaded" }),
      bob.goto(options.baseUrl, { waitUntil: "domcontentloaded" }),
    ]);

    log("Bootstrapping accounts...");
    await Promise.all([
      ensureAccountReady(alice, "Alice"),
      ensureAccountReady(bob, "Bob"),
    ]);

    log("Opening Dev Tools and starting diagnostics recording on both peers...");
    await Promise.all([
      startRecorder(alice, "Alice"),
      startRecorder(bob, "Bob"),
    ]);

    const [alicePeerId, bobPeerId] = await Promise.all([
      getOwnPeerId(alice, "Alice"),
      getOwnPeerId(bob, "Bob"),
    ]);
    log(`Alice peer ID: ${alicePeerId}`);
    log(`Bob peer ID:   ${bobPeerId}`);

    await Promise.all([
      connectPeer(alice, bobPeerId, "Alice"),
      connectPeer(bob, alicePeerId, "Bob"),
    ]);

    log("Running scenario: Bob starts DM with Alice...");
    await startDm(bob, alicePeerId);
    await sleep(2_000);

    const groupName = `E2E ${Date.now().toString().slice(-6)}`;
    log(`Running scenario: Alice creates group "${groupName}" and Bob joins via invite...`);
    const inviteCode = await createGroupAndCopyInvite(alice, groupName);
    await joinViaInvite(bob, inviteCode);

    log(`Settling for ${Math.round(options.settleMs / 1000)}s...`);
    await sleep(options.settleMs);

    log("Waiting for recorder completion, then downloading both logs...");
    const [aliceFile, bobFile] = await Promise.all([
      downloadRecorderFile(alice, "ALICE", options.outDir, options.recordWaitMs),
      downloadRecorderFile(bob, "BOB", options.outDir, options.recordWaitMs),
    ]);

    log("Completed.");
    log(`Alice log: ${aliceFile}`);
    log(`Bob log:   ${bobFile}`);

    await aliceContext.close();
    await bobContext.close();
  } finally {
    await browser.close();
    closeServer();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
