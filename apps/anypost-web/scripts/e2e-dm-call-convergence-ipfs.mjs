#!/usr/bin/env node

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:5173";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const webDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webDir, "../..");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {
    baseUrl: DEFAULT_BASE_URL,
    noServer: false,
    headed: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--url" && next) {
      out.baseUrl = next;
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
    if (arg === "--") continue;
    throw new Error(`Unknown or incomplete arg: ${arg}`);
  }

  return out;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (message) => {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`[dm-call-convergence ${stamp}] ${message}`);
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

const getOwnPeerId = async (page, label) => {
  await openDevTools(page);
  const networkPanel = page.locator("div.rounded-xl:has(strong:has-text(\"Network\"))").first();
  await networkPanel.waitFor({ state: "visible", timeout: 10_000 });
  const text = await networkPanel.innerText();
  const match = text.match(/PeerId\s+([1-9A-HJ-NP-Za-km-z]{32,})/);
  if (!match) throw new Error(`${label}: failed to parse own peer ID from Network panel`);
  return match[1];
};

const connectPeer = async (page, targetPeerId, label) => {
  await openDevTools(page);
  const peerPanel = page.locator("div.rounded-xl:has(strong:has-text(\"Peer Sharing\"))").first();
  await peerPanel.waitFor({ state: "visible", timeout: 10_000 });
  const connectInput = peerPanel.getByPlaceholder("12D3KooW...").first();
  await connectInput.fill(targetPeerId);
  await peerPanel.getByRole("button", { name: "Find & Connect" }).first().click();
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

const acceptDmWithRetry = async (
  alicePage,
  bobPage,
  alicePeerId,
  attempts = 18,
) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await startDm(bobPage, alicePeerId);
    const dmRequestBanner = alicePage.getByRole("button", { name: /pending DM request/i }).first();
    const bannerVisible = await isVisible(dmRequestBanner, 4_000);
    if (bannerVisible) {
      await dmRequestBanner.click();
    }
    const acceptBtn = alicePage.getByRole("button", { name: "Accept" }).first();
    if (await isVisible(acceptBtn, 4_000)) {
      await acceptBtn.click();
      log(`Alice: accepted DM request on attempt ${attempt}`);
      return;
    }
    log(`Alice: DM accept not visible yet (attempt ${attempt}/${attempts}, bannerVisible=${bannerVisible})`);
    await sleep(1_500);
  }
  throw new Error("Timed out waiting for DM request acceptance UI");
};

const openGroupInfo = async (page) => {
  const groupInfoTitle = page.getByText("Group Info", { exact: true });
  if (await isVisible(groupInfoTitle, 1000)) return;
  const headerGroupButton = page.locator("div.bg-tg-header button.flex.flex-col").first();
  await headerGroupButton.click();
  await groupInfoTitle.waitFor({ state: "visible", timeout: 10_000 });
};

const waitForDmHandshakeComplete = async (page, label, timeoutMs = 90_000) => {
  await openGroupInfo(page);
  const handshakeHeader = page.getByText("Handshake", { exact: false }).first();
  const handshakeComplete = page.getByText("Complete", { exact: true }).first();
  await handshakeHeader.waitFor({ state: "visible", timeout: timeoutMs });
  await handshakeComplete.waitFor({ state: "visible", timeout: timeoutMs });
  log(`${label}: DM handshake is complete`);
};

const sendMessage = async (page, text) => {
  const input = page.getByPlaceholder("Type a message...").first();
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(text);
  await input.press("Enter");
};

const waitForMessage = async (page, text, timeoutMs) => {
  try {
    await page.getByText(text, { exact: true }).first().waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
};

const sendAndWaitWithRetry = async (
  senderPage,
  senderLabel,
  senderTargetPeerId,
  receiverPage,
  receiverLabel,
  receiverTargetPeerId,
  textPrefix,
  attempts = 6,
) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const text = `${textPrefix}-${attempt}-${Date.now()}`;
    await startDm(senderPage, senderTargetPeerId);
    await startDm(receiverPage, receiverTargetPeerId);
    await sendMessage(senderPage, text);

    if (await waitForMessage(receiverPage, text, 12_000)) {
      log(`${senderLabel} -> ${receiverLabel} delivered on attempt ${attempt}`);
      return text;
    }
    log(`${senderLabel} -> ${receiverLabel} not delivered yet (attempt ${attempt}/${attempts})`);
    await sleep(1_500);
  }
  throw new Error(`Timed out delivering ${senderLabel} -> ${receiverLabel} message`);
};

const clickHeaderButton = async (page, name, label) => {
  const button = page.getByRole("button", { name }).first();
  await button.waitFor({ state: "visible", timeout: 10_000 });
  await button.click();
  log(`${label}: clicked '${name}'`);
};

const waitForCallCount = async (page, count, label, timeoutMs = 20_000) => {
  const regex = new RegExp(`\\b${count}\\s+in\\s+call\\b`, "i");
  try {
    await page.getByText(regex).first().waitFor({ state: "visible", timeout: timeoutMs });
    log(`${label}: observed call count ${count}`);
  } catch {
    throw new Error(`${label}: timed out waiting for '${count} in call'`);
  }
};

const waitForNoCallCount = async (page, label, timeoutMs = 20_000) => {
  const regex = /\\bin call\\b/i;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isVisible(page.getByText(regex).first(), 800))) {
      log(`${label}: call count cleared`);
      return;
    }
    await sleep(500);
  }
  throw new Error(`${label}: call count did not clear`);
};

const waitForCallTimelineEvent = async (page, pattern, label, timeoutMs = 20_000) => {
  await page.getByText(pattern).first().waitFor({ state: "visible", timeout: timeoutMs });
  log(`${label}: saw timeline event ${pattern}`);
};

const waitForParticipantCards = async (page, remoteLabel, label, timeoutMs = 20_000) => {
  await page.getByText("Call Participants", { exact: true }).first().waitFor({ state: "visible", timeout: timeoutMs });
  await page.getByText("You", { exact: true }).first().waitFor({ state: "visible", timeout: timeoutMs });
  await page.getByText(remoteLabel, { exact: true }).first().waitFor({ state: "visible", timeout: timeoutMs });
  log(`${label}: participant cards visible for You + ${remoteLabel}`);
};

const main = async () => {
  const options = parseArgs();

  let serverProc;
  const closeServer = () => {
    if (serverProc && !serverProc.killed) serverProc.kill("SIGTERM");
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
    const aliceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bobContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
    await Promise.all([
      ensurePeerConnection(alice, bobPeerId, "Alice"),
      ensurePeerConnection(bob, alicePeerId, "Bob"),
    ]);

    log("Starting DM flow: Bob invites Alice...");
    await acceptDmWithRetry(alice, bob, alicePeerId);
    await sleep(1_000);

    log("Reconfirming peer connection after DM acceptance...");
    await Promise.all([
      ensurePeerConnection(alice, bobPeerId, "Alice"),
      ensurePeerConnection(bob, alicePeerId, "Bob"),
    ]);

    log("Waiting for DM membership convergence...");
    await Promise.all([
      waitForDmHandshakeComplete(alice, "Alice"),
      waitForDmHandshakeComplete(bob, "Bob"),
    ]);

    log("Exchanging DM messages before call assertions...");
    await sendAndWaitWithRetry(
      bob,
      "Bob",
      alicePeerId,
      alice,
      "Alice",
      bobPeerId,
      "dm-call-bob",
    );
    await sendAndWaitWithRetry(
      alice,
      "Alice",
      bobPeerId,
      bob,
      "Bob",
      alicePeerId,
      "dm-call-alice",
    );

    log("Preparing both pages on the same DM chat...");
    await Promise.all([
      startDm(alice, bobPeerId),
      startDm(bob, alicePeerId),
    ]);
    await sleep(800);

    log("Starting call from Bob and validating call-state convergence...");
    await clickHeaderButton(bob, "Join Call", "Bob");
    await waitForCallTimelineEvent(bob, /started a call/i, "Bob");
    await waitForCallCount(bob, 1, "Bob");
    await waitForCallCount(alice, 1, "Alice");

    await clickHeaderButton(alice, "Join Call", "Alice");
    await waitForCallCount(alice, 2, "Alice");
    await waitForCallCount(bob, 2, "Bob");
    await waitForParticipantCards(alice, "Bob", "Alice");
    await waitForParticipantCards(bob, "Alice", "Bob");

    log("Leaving call from Alice, then Bob...");
    await clickHeaderButton(alice, "Leave", "Alice");
    await waitForCallCount(bob, 1, "Bob");

    await clickHeaderButton(bob, "Leave", "Bob");
    await waitForNoCallCount(alice, "Alice");
    await waitForNoCallCount(bob, "Bob");
    await waitForCallTimelineEvent(alice, /Call ended after/i, "Alice");
    await waitForCallTimelineEvent(bob, /Call ended after/i, "Bob");

    log("Validation passed: DM call state converges across both peers.");

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
