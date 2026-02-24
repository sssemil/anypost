#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:5173";
const DEFAULT_ITERATIONS = 10;

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const webDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webDir, "../..");
const invocationCwd = process.env.INIT_CWD && process.env.INIT_CWD.trim().length > 0
  ? process.env.INIT_CWD
  : repoRoot;

const resolveUserPath = (inputPath) =>
  path.isAbsolute(inputPath) ? inputPath : path.resolve(invocationCwd, inputPath);

const pad = (num) => String(num).padStart(2, "0");
const nowStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {
    baseUrl: DEFAULT_BASE_URL,
    outDir: path.resolve(repoRoot, "artifacts", "soak", `dm-no-relay-${nowStamp()}`),
    iterations: DEFAULT_ITERATIONS,
    noServer: false,
    headed: false,
    maxFailures: Number.POSITIVE_INFINITY,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--") continue;
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
    if (arg === "--iterations" && next) {
      out.iterations = Math.max(1, Number(next));
      i += 1;
      continue;
    }
    if (arg === "--max-failures" && next) {
      out.maxFailures = Math.max(1, Number(next));
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
  console.log(`[soak ${stamp}] ${message}`);
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

const runCommandCapture = (cmd, args, cwd) =>
  new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    proc.on("error", (error) => {
      resolve({
        code: -1,
        stdout,
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`,
      });
    });
    proc.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
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

const main = async () => {
  const options = parseArgs();
  await mkdir(options.outDir, { recursive: true });
  const startedAt = Date.now();

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

  const results = [];
  let failures = 0;

  try {
    for (let i = 1; i <= options.iterations; i += 1) {
      const startedIterationAt = Date.now();
      const label = `iteration-${String(i).padStart(3, "0")}`;
      log(`Running ${label}/${String(options.iterations).padStart(3, "0")}`);

      const args = [
        "--filter",
        "anypost-web",
        "run",
        "e2e:dm-no-relay-ipfs",
        "--",
        "--no-server",
        "--url",
        options.baseUrl,
      ];
      if (options.headed) {
        args.push("--headed");
      }

      const run = await runCommandCapture("pnpm", args, repoRoot);
      const durationMs = Date.now() - startedIterationAt;
      const passed = run.code === 0;
      if (!passed) failures += 1;

      const logPath = path.join(options.outDir, `${label}.log`);
      await writeFile(
        logPath,
        [
          `# ${label}`,
          `exit_code: ${run.code}`,
          `duration_ms: ${durationMs}`,
          "",
          "## stdout",
          run.stdout,
          "",
          "## stderr",
          run.stderr,
        ].join("\n"),
        "utf8",
      );

      results.push({
        iteration: i,
        passed,
        exitCode: run.code,
        durationMs,
        logPath,
      });

      log(`${label} ${passed ? "PASSED" : "FAILED"} (${durationMs}ms)`);

      if (failures >= options.maxFailures) {
        log(`Stopping early after reaching max failures (${options.maxFailures}).`);
        break;
      }
    }
  } finally {
    closeServer();
  }

  const finishedAt = Date.now();
  const summary = {
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    baseUrl: options.baseUrl,
    iterationsRequested: options.iterations,
    iterationsCompleted: results.length,
    passed: results.filter((entry) => entry.passed).length,
    failed: results.filter((entry) => !entry.passed).length,
    passRate: results.length > 0
      ? Number((results.filter((entry) => entry.passed).length / results.length).toFixed(4))
      : 0,
    results,
  };

  const summaryPath = path.join(options.outDir, "summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  log(`Soak summary written to ${summaryPath}`);
  log(`Pass rate: ${summary.passed}/${summary.iterationsCompleted}`);

  if (summary.failed > 0) {
    throw new Error(`Soak failed: ${summary.failed}/${summary.iterationsCompleted} iterations failed`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
