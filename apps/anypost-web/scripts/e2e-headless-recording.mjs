#!/usr/bin/env node

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
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
  await page.getByTitle("Menu").first().click();
};

const openDevTools = async (page) => {
  const recorderHeader = page.getByText("Diagnostics Recorder", { exact: true }).first();
  if (await isVisible(recorderHeader, 800)) return;

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await openMenu(page);
      await page.getByRole("button", { name: "Developer Tools" }).first().click();
      await recorderHeader.waitFor({ state: "visible", timeout: 10_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(300);
    }
  }
  throw lastError ?? new Error("Unable to open Developer Tools");
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

const ensurePeerConnection = async (page, targetPeerId, label, timeoutMs = 60_000) => {
  await openDevTools(page);
  const peerPanel = page.locator("div.rounded-xl:has(strong:has-text(\"Peer Sharing\"))").first();
  await peerPanel.waitFor({ state: "visible", timeout: 10_000 });

  const connectInput = peerPanel.getByPlaceholder("12D3KooW...").first();
  const checkInput = peerPanel.getByPlaceholder("12D3KooW...").nth(1);
  const checkButton = peerPanel.getByRole("button", { name: "Check" }).first();
  const findAndConnectButton = peerPanel.getByRole("button", { name: "Find & Connect" }).first();
  const connectedText = peerPanel.getByText("Connected to", { exact: false }).first();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await checkInput.fill(targetPeerId);
    await checkButton.click();
    if (await isVisible(connectedText, 1200)) {
      log(`${label}: confirmed connected -> ${targetPeerId.slice(0, 12)}...`);
      return;
    }

    await connectInput.fill(targetPeerId);
    await findAndConnectButton.click();
    await sleep(2_000);
  }
  throw new Error(`${label}: timed out waiting for connection to ${targetPeerId}`);
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
  const joinInput = page.getByPlaceholder("Paste invite code...").first();
  if (!(await isVisible(joinInput, 700))) {
    const joinButton = page
      .locator("button:not(:disabled)")
      .filter({ hasText: /^Join$/ })
      .first();
    await joinButton.waitFor({ state: "visible", timeout: 15_000 });
    await joinButton.click();
  }
  await joinInput.fill(inviteCode);
  await joinInput.press("Enter");
};

const openGroupInfo = async (page) => {
  const groupInfoTitle = page.getByText("Group Info", { exact: true });
  if (await isVisible(groupInfoTitle, 1000)) return;
  const headerGroupButton = page.locator("div.bg-tg-header button.flex.flex-col").first();
  await headerGroupButton.click();
  await groupInfoTitle.waitFor({ state: "visible", timeout: 10_000 });
};

const triggerJoinRetryNowIfVisible = async (page, label) => {
  await openGroupInfo(page);
  const retryNowBtn = page.getByRole("button", { name: "Retry now" }).first();
  if (await isVisible(retryNowBtn, 400)) {
    await retryNowBtn.click();
    log(`${label}: triggered join retry now`);
    return true;
  }
  return false;
};

const approveFirstPendingJoin = async (adminPage, joinerPage, adminLabel, joinerLabel) => {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await openGroupInfo(adminPage);
    const approveButton = adminPage.getByRole("button", { name: "Approve" }).first();
    if (await isVisible(approveButton, 1_200)) {
      await approveButton.click();
      log(`${adminLabel}: approved pending join request`);
      return true;
    }
    await triggerJoinRetryNowIfVisible(joinerPage, joinerLabel);
    await sleep(2_500);
  }
  log(`${adminLabel}: pending join approval did not appear within timeout`);
  return false;
};

const waitForMembersCount = async (page, expectedCount, label) => {
  await openGroupInfo(page);
  try {
    await page
      .getByText(new RegExp(`MEMBERS \\(${expectedCount}\\)`, "i"))
      .waitFor({ state: "visible", timeout: 45_000 });
    log(`${label}: members count reached ${expectedCount}`);
    return true;
  } catch {
    log(`${label}: members count did not reach ${expectedCount} within timeout`);
    return false;
  }
};

const acceptFirstDmRequest = async (page, label) => {
  const dmRequestBanner = page.getByRole("button", { name: /pending DM request/i }).first();
  try {
    await dmRequestBanner.waitFor({ state: "visible", timeout: 45_000 });
    await dmRequestBanner.click();
  } catch {}
  const acceptBtn = page.getByRole("button", { name: "Accept" }).first();
  try {
    await acceptBtn.waitFor({ state: "visible", timeout: 45_000 });
    await acceptBtn.click();
    log(`${label}: accepted DM request`);
    return true;
  } catch {
    log(`${label}: DM accept button did not appear within timeout`);
    return false;
  }
};

const declineFirstDmRequest = async (page, label) => {
  const dmRequestBanner = page.getByRole("button", { name: /pending DM request/i }).first();
  try {
    await dmRequestBanner.waitFor({ state: "visible", timeout: 45_000 });
    await dmRequestBanner.click();
  } catch {}
  const declineBtn = page.getByRole("button", { name: "Decline" }).first();
  try {
    await declineBtn.waitFor({ state: "visible", timeout: 45_000 });
    await declineBtn.click();
    log(`${label}: declined DM request`);
    return true;
  } catch {
    log(`${label}: DM decline button did not appear within timeout`);
    return false;
  }
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

const loadRecordingEntries = async (recordingPath) => {
  const text = await readFile(recordingPath, "utf8");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid recording payload: ${recordingPath}`);
  }
  return parsed.entries;
};

const countEntriesByType = (entries, type) =>
  entries.reduce((sum, entry) => (entry?.type === type ? sum + 1 : sum), 0);

const existsEntry = (entries, predicate) => entries.some((entry) => predicate(entry));

const validateRecordings = async (alicePath, bobPath, alicePeerId, bobPeerId, charliePeerId) => {
  const [aliceEntries, bobEntries] = await Promise.all([
    loadRecordingEntries(alicePath),
    loadRecordingEntries(bobPath),
  ]);

  const bobPublishFailures = countEntriesByType(bobEntries, "dm-request-publish-failed");
  if (bobPublishFailures > 0) {
    throw new Error(`Validation failed: Bob has ${bobPublishFailures} dm-request-publish-failed entries`);
  }

  const bobPublishedCount = countEntriesByType(bobEntries, "dm-request-published");
  if (bobPublishedCount < 1) {
    throw new Error("Validation failed: Bob never published a DM request");
  }

  const aliceInboundCount = countEntriesByType(aliceEntries, "dm-request-inbound");
  const aliceQueuedCount = countEntriesByType(aliceEntries, "dm-request-inbound-queued");
  if (aliceInboundCount < 1 && aliceQueuedCount < 1) {
    throw new Error("Validation failed: Alice did not receive a DM request");
  }

  const aliceHasPeerProfileRequest = existsEntry(
    aliceEntries,
    (entry) => entry?.type === "profile-request" && entry?.payload?.peerId === bobPeerId,
  );
  if (!aliceHasPeerProfileRequest) {
    throw new Error("Validation failed: Alice did not trigger profile sync for Bob");
  }

  const bobHasPeerProfileRequest = existsEntry(
    bobEntries,
    (entry) => entry?.type === "profile-request" && entry?.payload?.peerId === alicePeerId,
  );
  if (!bobHasPeerProfileRequest) {
    throw new Error("Validation failed: Bob did not trigger profile sync for Alice");
  }

  const aliceHasJoinRequest = existsEntry(
    aliceEntries,
    (entry) => entry?.type === "join-request",
  );
  if (!aliceHasJoinRequest) {
    throw new Error("Validation failed: Alice never saw an inbound join request");
  }

  const aliceApprovedMember = existsEntry(
    aliceEntries,
    (entry) => entry?.type === "member-approved",
  );
  if (!aliceApprovedMember) {
    throw new Error("Validation failed: Alice never approved a pending join");
  }

  const bobJoinedViaInvite = existsEntry(
    bobEntries,
    (entry) => entry?.type === "join-via-invite-succeeded",
  );
  if (!bobJoinedViaInvite) {
    throw new Error("Validation failed: Bob never joined via invite");
  }

  const aliceAcceptedBobDm = existsEntry(
    aliceEntries,
    (entry) => entry?.type === "dm-request-accepted" && entry?.payload?.senderPeerId === bobPeerId,
  );
  if (!aliceAcceptedBobDm) {
    throw new Error("Validation failed: Alice did not accept Bob DM request");
  }

  const aliceDeclinedCharlieDm = existsEntry(
    aliceEntries,
    (entry) => entry?.type === "dm-request-declined" && entry?.payload?.senderPeerId === charliePeerId,
  );
  if (!aliceDeclinedCharlieDm) {
    throw new Error("Validation failed: Alice did not decline Charlie DM request");
  }
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
    const charlieContext = await browser.newContext({
      acceptDownloads: false,
      viewport: { width: 1440, height: 900 },
    });
    await aliceContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.baseUrl });
    await bobContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.baseUrl });
    await charlieContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.baseUrl });

    const alice = await aliceContext.newPage();
    const bob = await bobContext.newPage();
    const charlie = await charlieContext.newPage();

    log("Opening Alice/Bob/Charlie pages...");
    await Promise.all([
      alice.goto(options.baseUrl, { waitUntil: "domcontentloaded" }),
      bob.goto(options.baseUrl, { waitUntil: "domcontentloaded" }),
      charlie.goto(options.baseUrl, { waitUntil: "domcontentloaded" }),
    ]);

    log("Bootstrapping accounts...");
    await Promise.all([
      ensureAccountReady(alice, "Alice"),
      ensureAccountReady(bob, "Bob"),
      ensureAccountReady(charlie, "Charlie"),
    ]);

    log("Opening Dev Tools and starting diagnostics recording on both peers...");
    await Promise.all([
      startRecorder(alice, "Alice"),
      startRecorder(bob, "Bob"),
    ]);

    const [alicePeerId, bobPeerId, charliePeerId] = await Promise.all([
      getOwnPeerId(alice, "Alice"),
      getOwnPeerId(bob, "Bob"),
      getOwnPeerId(charlie, "Charlie"),
    ]);
    log(`Alice peer ID: ${alicePeerId}`);
    log(`Bob peer ID:   ${bobPeerId}`);
    log(`Charlie peer ID: ${charliePeerId}`);

    await Promise.all([
      connectPeer(alice, bobPeerId, "Alice"),
      connectPeer(bob, alicePeerId, "Bob"),
      connectPeer(alice, charliePeerId, "Alice"),
      connectPeer(charlie, alicePeerId, "Charlie"),
    ]);
    await Promise.all([
      ensurePeerConnection(alice, bobPeerId, "Alice"),
      ensurePeerConnection(bob, alicePeerId, "Bob"),
      ensurePeerConnection(alice, charliePeerId, "Alice"),
      ensurePeerConnection(charlie, alicePeerId, "Charlie"),
    ]);

    let scenarioError = null;
    try {
      const groupName = `E2E ${Date.now().toString().slice(-6)}`;
      log(`Running scenario: Alice creates group "${groupName}", Bob requests join, Alice approves...`);
      const inviteCode = await createGroupAndCopyInvite(alice, groupName);
      await joinViaInvite(bob, inviteCode);
      const approved = await approveFirstPendingJoin(alice, bob, "Alice", "Bob");
      if (approved) {
        await waitForMembersCount(bob, 2, "Bob");
      }

      log("Running scenario: Bob starts DM with Alice, Alice accepts...");
      await startDm(bob, alicePeerId);
      await acceptFirstDmRequest(alice, "Alice");

      log("Running scenario: Charlie starts DM with Alice, Alice declines...");
      await startDm(charlie, alicePeerId);
      await declineFirstDmRequest(alice, "Alice");
    } catch (error) {
      scenarioError = error instanceof Error ? error : new Error(String(error));
      log(`Scenario execution error: ${scenarioError.message}`);
    }

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

    log("Validating recordings...");
    await validateRecordings(aliceFile, bobFile, alicePeerId, bobPeerId, charliePeerId);
    log("Validation passed.");

    if (scenarioError) {
      throw scenarioError;
    }

    await aliceContext.close();
    await bobContext.close();
    await charlieContext.close();
  } finally {
    await browser.close();
    closeServer();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
