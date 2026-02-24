#!/usr/bin/env node

import net from "node:net";
import process from "node:process";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const electronRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(electronRoot, "../..");

const parseArgs = () => {
  const args = process.argv.slice(2);
  let profile = process.env.ANYPOST_PROFILE ?? "";
  let requestedPort = process.env.ANYPOST_WEB_DEV_PORT
    ? Number(process.env.ANYPOST_WEB_DEV_PORT)
    : undefined;
  let noSandbox = process.env.ANYPOST_ELECTRON_NO_SANDBOX === "1";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--profile" && next) {
      profile = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length);
      continue;
    }
    if (arg === "--port" && next) {
      requestedPort = Number(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--port=")) {
      requestedPort = Number(arg.slice("--port=".length));
      continue;
    }
    if (arg === "--no-sandbox") {
      noSandbox = true;
      continue;
    }
    if (arg === "--") continue;
  }

  const trimmedProfile = profile.trim();
  return {
    profile: trimmedProfile.length > 0 ? trimmedProfile : null,
    requestedPort,
    noSandbox,
  };
};

const runCommand = (cmd, args, cwd, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} exited (${code ?? signal ?? "unknown"})`));
      }
    });
  });

const isPortFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });

const pickPort = async (requestedPort) => {
  if (requestedPort && Number.isFinite(requestedPort) && requestedPort > 0) {
    const free = await isPortFree(requestedPort);
    if (free) return requestedPort;
    throw new Error(`Requested port ${requestedPort} is already in use`);
  }

  let port = 5173;
  while (port < 5200) {
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortFree(port);
    if (free) return port;
    port += 1;
  }
  throw new Error("Unable to find a free dev port in range 5173-5199");
};

const waitForTcp = (port, timeoutMs = 90_000) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for tcp:127.0.0.1:${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });

const forwardSignals = (children) => {
  const signalHandler = (signal) => {
    for (const child of children) {
      if (child && !child.killed) {
        try {
          child.kill(signal);
        } catch {
          // ignore
        }
      }
    }
  };

  process.on("SIGINT", () => signalHandler("SIGINT"));
  process.on("SIGTERM", () => signalHandler("SIGTERM"));
};

const main = async () => {
  const { profile, requestedPort, noSandbox } = parseArgs();
  const port = await pickPort(requestedPort);
  const webUrl = `http://127.0.0.1:${port}`;

  console.log(
    `[electron-dev] profile=${profile ?? "default"} web=${webUrl} noSandbox=${noSandbox ? "yes" : "no"}`,
  );

  await runCommand("pnpm", ["--filter", "anypost-relay", "build"], repoRoot);
  await runCommand("pnpm", ["--filter", "anypost-core", "build"], repoRoot);
  await runCommand("pnpm", ["run", "build:main"], electronRoot);

  const baseEnv = {
    ...process.env,
    ANYPOST_WEB_DEV_URL: webUrl,
  };
  if (profile) {
    baseEnv.ANYPOST_PROFILE = profile;
  }

  const coreWatch = spawn(
    "pnpm",
    ["--filter", "anypost-core", "exec", "tsc", "--build", "--watch", "--preserveWatchOutput"],
    { cwd: repoRoot, env: baseEnv, stdio: "inherit" },
  );

  const vite = spawn(
    "pnpm",
    [
      "--filter",
      "anypost-web",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
      "--clearScreen",
      "false",
    ],
    { cwd: repoRoot, env: baseEnv, stdio: "inherit" },
  );

  forwardSignals([coreWatch, vite]);

  await waitForTcp(port);

  const electronArgs = ["./dist/main/main.js"];
  if (profile) {
    electronArgs.push("--profile", profile);
  }
  if (noSandbox) {
    electronArgs.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  const electron = spawn("electron", electronArgs, {
    cwd: electronRoot,
    env: baseEnv,
    stdio: "inherit",
  });

  forwardSignals([coreWatch, vite, electron]);

  const stopOthers = () => {
    for (const child of [coreWatch, vite]) {
      if (!child.killed) {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
    }
  };

  electron.on("exit", (code) => {
    stopOthers();
    process.exit(code ?? 0);
  });

  const onChildExit = (name, code, signal) => {
    if (name === "electron") return;
    if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") return;
    console.error(`[electron-dev] ${name} exited unexpectedly (${code ?? signal ?? "unknown"})`);
    if (!electron.killed) {
      try {
        electron.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    stopOthers();
    process.exit(code ?? 1);
  };

  coreWatch.on("exit", (code, signal) => onChildExit("core-watch", code, signal));
  vite.on("exit", (code, signal) => onChildExit("vite", code, signal));
  electron.on("exit", (code, signal) => onChildExit("electron", code, signal));
};

main().catch((error) => {
  console.error("[electron-dev] failed:", error);
  process.exit(1);
});
