#!/usr/bin/env node

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:5173";
const DEFAULT_RELAY_TCP_PORT = 19001;
const DEFAULT_RELAY_WS_PORT = 19090;
const UNKNOWN_MIN_COUNT = 5;

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const webDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webDir, "../..");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {
    baseUrl: DEFAULT_BASE_URL,
    noServer: false,
    noRelay: false,
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
    if (arg === "--no-relay") {
      out.noRelay = true;
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
  console.log(`[dm-3relay ${stamp}] ${message}`);
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
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code}`));
    });
  });

const startRelay = async () => {
  log("Building anypost-core + anypost-relay...");
  await runCommand("pnpm", ["--filter", "anypost-core", "build"], repoRoot);
  await runCommand("pnpm", ["--filter", "anypost-relay", "build"], repoRoot);

  log("Starting shared relay...");
  let relayPeerId = "";
  let relayWsAddr = "";
  const env = {
    ...process.env,
    RELAY_TCP_PORT: String(DEFAULT_RELAY_TCP_PORT),
    RELAY_WS_PORT: String(DEFAULT_RELAY_WS_PORT),
  };
  const proc = spawn("pnpm", ["--filter", "anypost-relay", "start"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const handleLine = (line) => {
    const text = line.toString().trim();
    if (text.length === 0) return;
    console.log(`[relay] ${text}`);
    const peerMatch = text.match(/^PeerId:\s+(\S+)/);
    if (peerMatch) relayPeerId = peerMatch[1];
    const listenMatch = text.match(/^Listening on:\s+(\S+)/);
    if (listenMatch && listenMatch[1].includes("/ws")) relayWsAddr = listenMatch[1];
  };

  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/)) handleLine(line);
  });
  proc.stderr.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim().length > 0) console.error(`[relay-err] ${line}`);
    }
  });

  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (relayPeerId && relayWsAddr) break;
    await sleep(250);
  }
  if (!relayPeerId || !relayWsAddr) {
    proc.kill("SIGTERM");
    throw new Error("Relay did not publish peer ID and ws listen address in time");
  }
  log(`Relay ready: ${relayPeerId} @ ${relayWsAddr}`);
  return { proc, relayWsAddr };
};

const startWebServer = async (baseUrl, relayWsAddr) => {
  log("Building anypost-core...");
  await runCommand("pnpm", ["--filter", "anypost-core", "build"], repoRoot);

  log("Starting Vite dev server...");
  const env = relayWsAddr
    ? { ...process.env, VITE_RELAY_MULTIADDR: relayWsAddr }
    : process.env;
  const proc = spawn(
    "pnpm",
    ["--filter", "anypost-web", "exec", "vite", "--host", "127.0.0.1", "--port", "5173"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env,
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

const ensurePeerConnection = async (page, targetPeerId, label, timeoutMs = 90_000) => {
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
  receiverPage,
  requesterPage,
  receiverPeerId,
  receiverLabel,
  requesterLabel,
  attempts = 18,
) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await startDm(requesterPage, receiverPeerId);
    const dmRequestBanner = receiverPage.getByRole("button", { name: /pending DM request/i }).first();
    const bannerVisible = await isVisible(dmRequestBanner, 4_000);
    if (bannerVisible) await dmRequestBanner.click();
    const acceptBtn = receiverPage.getByRole("button", { name: "Accept" }).first();
    if (await isVisible(acceptBtn, 4_000)) {
      await acceptBtn.click();
      log(`${receiverLabel}: accepted DM from ${requesterLabel} on attempt ${attempt}`);
      return;
    }
    await sleep(1_500);
  }
  throw new Error(`${receiverLabel}: timed out accepting DM from ${requesterLabel}`);
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
  log(`${label}: DM handshake complete`);
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
  attempts = 8,
) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const text = `${textPrefix}-${attempt}-${Date.now()}`;
    await startDm(senderPage, senderTargetPeerId);
    await startDm(receiverPage, receiverTargetPeerId);
    await sendMessage(senderPage, text);
    if (await waitForMessage(receiverPage, text, 12_000)) {
      log(`${senderLabel} -> ${receiverLabel} delivered on attempt ${attempt}`);
      return;
    }
    await sleep(1_500);
  }
  throw new Error(`Timed out delivering ${senderLabel} -> ${receiverLabel}`);
};

const parseTopologyCounts = async (page, label) => {
  await openDevTools(page);
  const networkPanel = page.locator("div.rounded-xl:has(strong:has-text(\"Network\"))").first();
  await networkPanel.waitFor({ state: "visible", timeout: 10_000 });

  const appPeersOnly = networkPanel.getByLabel("App peers only").first();
  if (await appPeersOnly.isChecked()) {
    await appPeersOnly.click();
    await sleep(600);
  }

  const text = await networkPanel.innerText();
  const app = Number(text.match(/\bApp\s+(\d+)\b/)?.[1] ?? 0);
  const relay = Number(text.match(/\bRelay\s+(\d+)\b/)?.[1] ?? 0);
  const unknown = Number(text.match(/\bUnknown\s+(\d+)\b/)?.[1] ?? 0);

  log(`${label}: topology counts app=${app} relay=${relay} unknown=${unknown}`);
  return { app, relay, unknown };
};

const assertTopologyExpectations = (counts, label) => {
  if (counts.app < 2) {
    throw new Error(`${label}: expected at least 2 app peers, got ${counts.app}`);
  }
  if (counts.relay < 1) {
    throw new Error(`${label}: expected at least 1 relay node, got ${counts.relay}`);
  }
  if (counts.unknown < UNKNOWN_MIN_COUNT) {
    throw new Error(`${label}: expected at least ${UNKNOWN_MIN_COUNT} unknown peers, got ${counts.unknown}`);
  }
};

const main = async () => {
  const options = parseArgs();

  let relayProc;
  let serverProc;
  const closeAll = () => {
    if (serverProc && !serverProc.killed) serverProc.kill("SIGTERM");
    if (relayProc && !relayProc.killed) relayProc.kill("SIGTERM");
  };
  process.on("SIGINT", () => {
    closeAll();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    closeAll();
    process.exit(143);
  });

  let relayWsAddr = "";
  if (!options.noRelay) {
    const relay = await startRelay();
    relayProc = relay.proc;
    relayWsAddr = relay.relayWsAddr;
  }

  if (!options.noServer) {
    serverProc = await startWebServer(options.baseUrl, relayWsAddr);
  } else {
    await waitForHttp(options.baseUrl, 10_000);
  }

  const browser = await chromium.launch({ headless: !options.headed });
  try {
    const aliceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bobContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const carolContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const alice = await aliceContext.newPage();
    const bob = await bobContext.newPage();
    const carol = await carolContext.newPage();

    log("Opening Alice/Bob/Carol pages...");
    await Promise.all([
      alice.goto(options.baseUrl, { waitUntil: "domcontentloaded" }),
      bob.goto(options.baseUrl, { waitUntil: "domcontentloaded" }),
      carol.goto(options.baseUrl, { waitUntil: "domcontentloaded" }),
    ]);

    log("Bootstrapping accounts...");
    await Promise.all([
      ensureAccountReady(alice, "Alice"),
      ensureAccountReady(bob, "Bob"),
      ensureAccountReady(carol, "Carol"),
    ]);

    const [alicePeerId, bobPeerId, carolPeerId] = await Promise.all([
      getOwnPeerId(alice, "Alice"),
      getOwnPeerId(bob, "Bob"),
      getOwnPeerId(carol, "Carol"),
    ]);

    log(`Alice peer ID: ${alicePeerId}`);
    log(`Bob peer ID:   ${bobPeerId}`);
    log(`Carol peer ID: ${carolPeerId}`);

    log("Connecting all pairs...");
    await Promise.all([
      connectPeer(alice, bobPeerId, "Alice"),
      connectPeer(alice, carolPeerId, "Alice"),
      connectPeer(bob, alicePeerId, "Bob"),
      connectPeer(bob, carolPeerId, "Bob"),
      connectPeer(carol, alicePeerId, "Carol"),
      connectPeer(carol, bobPeerId, "Carol"),
    ]);
    await Promise.all([
      ensurePeerConnection(alice, bobPeerId, "Alice"),
      ensurePeerConnection(alice, carolPeerId, "Alice"),
      ensurePeerConnection(bob, alicePeerId, "Bob"),
      ensurePeerConnection(bob, carolPeerId, "Bob"),
      ensurePeerConnection(carol, alicePeerId, "Carol"),
      ensurePeerConnection(carol, bobPeerId, "Carol"),
    ]);

    log("Establishing DM handshakes for all pairs...");
    await acceptDmWithRetry(alice, bob, alicePeerId, "Alice", "Bob");
    await Promise.all([
      waitForDmHandshakeComplete(alice, "Alice"),
      waitForDmHandshakeComplete(bob, "Bob"),
    ]);

    await acceptDmWithRetry(bob, carol, bobPeerId, "Bob", "Carol");
    await Promise.all([
      waitForDmHandshakeComplete(bob, "Bob"),
      waitForDmHandshakeComplete(carol, "Carol"),
    ]);

    await acceptDmWithRetry(carol, alice, carolPeerId, "Carol", "Alice");
    await Promise.all([
      waitForDmHandshakeComplete(carol, "Carol"),
      waitForDmHandshakeComplete(alice, "Alice"),
    ]);

    log("Sending DM traffic across all pairs...");
    await sendAndWaitWithRetry(alice, "Alice", bobPeerId, bob, "Bob", alicePeerId, "three-node-ab");
    await sendAndWaitWithRetry(bob, "Bob", carolPeerId, carol, "Carol", bobPeerId, "three-node-bc");
    await sendAndWaitWithRetry(carol, "Carol", alicePeerId, alice, "Alice", carolPeerId, "three-node-ca");

    log("Waiting for network graph to settle...");
    await sleep(12_000);

    const [aliceCounts, bobCounts, carolCounts] = await Promise.all([
      parseTopologyCounts(alice, "Alice"),
      parseTopologyCounts(bob, "Bob"),
      parseTopologyCounts(carol, "Carol"),
    ]);

    assertTopologyExpectations(aliceCounts, "Alice");
    assertTopologyExpectations(bobCounts, "Bob");
    assertTopologyExpectations(carolCounts, "Carol");

    log("Validation passed: each node sees 2+ app peers, unknown peers, and shared relay.");
    await Promise.all([aliceContext.close(), bobContext.close(), carolContext.close()]);
  } finally {
    await browser.close();
    closeAll();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
