import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRelayNode } from "anypost-relay/create-relay-node";
import { ANYPOST_RELAY_NAMESPACE, createProviderCid } from "anypost-core/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RelayState = {
  readonly running: boolean;
  readonly peerId?: string;
  readonly listenAddrs: readonly string[];
  readonly lastError?: string;
};

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let relayNode: Awaited<ReturnType<typeof createRelayNode>> | null = null;
let relayAdvertiseTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
const pendingDeepLinks: string[] = [];

const RELAY_READVERTISE_INTERVAL_MS = 12 * 60 * 60 * 1_000;
const APP_PROTOCOL = "anypost";
const MAX_PROFILE_LENGTH = 64;

const normalizeProfileName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, MAX_PROFILE_LENGTH);

const parseProfileFromArgv = (argv: readonly string[]): string | null => {
  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg.startsWith("--profile=")) {
      const normalized = normalizeProfileName(arg.slice("--profile=".length));
      return normalized.length > 0 ? normalized : null;
    }
    if (arg === "--profile") {
      const next = argv[idx + 1];
      if (!next) return null;
      const normalized = normalizeProfileName(next);
      return normalized.length > 0 ? normalized : null;
    }
  }
  const fromEnv = normalizeProfileName(process.env.ANYPOST_PROFILE ?? "");
  return fromEnv.length > 0 ? fromEnv : null;
};

const activeProfile = parseProfileFromArgv(process.argv);
if (activeProfile) {
  const userDataPath = path.join(app.getPath("appData"), "Anypost", activeProfile);
  app.setPath("userData", userDataPath);
}

let relayState: RelayState = {
  running: false,
  listenAddrs: [],
};

const pushRelayState = () => {
  mainWindow?.webContents.send("anypost:relay-state-update", relayState);
};

const updateRelayState = (next: RelayState) => {
  relayState = next;
  pushRelayState();
};

const advertiseRelayProvider = async (node: Awaited<ReturnType<typeof createRelayNode>>) => {
  const relayCid = await createProviderCid(ANYPOST_RELAY_NAMESPACE);
  await node.contentRouting.provide(relayCid);
};

const startEmbeddedRelay = async () => {
  try {
    const keyPath = path.join(app.getPath("userData"), "relay", "relay-identity.key");
    const node = await createRelayNode({
      keyPath,
      listenAddresses: [
        "/ip4/0.0.0.0/tcp/0",
        "/ip4/0.0.0.0/tcp/0/ws",
      ],
    });
    relayNode = node;

    const listenAddrs = node.getMultiaddrs().map((addr) => addr.toString());
    updateRelayState({
      running: true,
      peerId: node.peerId.toString(),
      listenAddrs,
    });

    await advertiseRelayProvider(node);
    relayAdvertiseTimer = setInterval(() => {
      if (!relayNode) return;
      void advertiseRelayProvider(relayNode).catch((error) => {
        updateRelayState({
          ...relayState,
          running: true,
          lastError: error instanceof Error ? error.message : String(error),
        });
      });
    }, RELAY_READVERTISE_INTERVAL_MS);
  } catch (error) {
    updateRelayState({
      running: false,
      listenAddrs: [],
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
};

const stopEmbeddedRelay = async () => {
  if (relayAdvertiseTimer) {
    clearInterval(relayAdvertiseTimer);
    relayAdvertiseTimer = null;
  }
  if (relayNode) {
    await relayNode.stop();
    relayNode = null;
  }
  updateRelayState({
    running: false,
    listenAddrs: [],
  });
};

const extractDeepLinks = (argv: readonly string[]): readonly string[] =>
  argv.filter((arg) => arg.startsWith(`${APP_PROTOCOL}://`));

const enqueueDeepLink = (url: string) => {
  const win = mainWindow;
  const readyToSend =
    !!win &&
    !win.isDestroyed() &&
    !win.webContents.isLoadingMainFrame();
  if (readyToSend) {
    win.webContents.send("anypost:deep-link", url);
    return;
  }
  pendingDeepLinks.push(url);
};

const focusMainWindow = () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
};

const createTray = () => {
  if (tray) return;
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAQAAAC1+jfqAAAAQklEQVR42mNgIAUwEqmOgT4j1H8gqMDAwMDwH4QxQFQnGAGiQYFhYWEQGQY0F4QkA8QWgBAlYQjSCJQzA0xShWQwAABiOBxSxP3M9AAAAAElFTkSuQmCC",
  );
  tray = new Tray(icon);
  tray.setToolTip("Anypost");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Anypost",
        click: () => focusMainWindow(),
      },
      {
        label: "Hide",
        click: () => mainWindow?.hide(),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          void shutdownApp();
        },
      },
    ]),
  );
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      focusMainWindow();
    }
  });
};

const createMainWindow = async () => {
  const preloadPath = path.resolve(__dirname, "../preload/preload.js");
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#0d1b2a",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event) => {
    if (!shuttingDown) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ANYPOST_WEB_DEV_URL;
  if (devUrl && devUrl.trim().length > 0) {
    await mainWindow.loadURL(devUrl);
  } else {
    const rendererIndex = path.resolve(__dirname, "../renderer/index.html");
    await mainWindow.loadFile(rendererIndex);
  }

  pushRelayState();
};

const showNotification = (payload: {
  readonly title: string;
  readonly body: string;
  readonly groupId: string;
  readonly senderPeerId: string;
}) => {
  if (!Notification.isSupported()) return;
  const title = payload.title.trim().slice(0, 120) || "Anypost";
  const body = payload.body.trim().slice(0, 300);
  const notification = new Notification({ title, body, silent: false });
  notification.on("click", () => {
    focusMainWindow();
  });
  notification.show();
};

const registerIpcHandlers = () => {
  ipcMain.handle("anypost:get-relay-state", async () => relayState);
  ipcMain.handle("anypost:get-pending-deep-links", async () => {
    const links = [...pendingDeepLinks];
    pendingDeepLinks.length = 0;
    return links;
  });
  ipcMain.on("anypost:notify-message", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const data = payload as {
      readonly title?: unknown;
      readonly body?: unknown;
      readonly groupId?: unknown;
      readonly senderPeerId?: unknown;
    };
    if (
      typeof data.title !== "string" ||
      typeof data.body !== "string" ||
      typeof data.groupId !== "string" ||
      typeof data.senderPeerId !== "string"
    ) {
      return;
    }
    showNotification({
      title: data.title,
      body: data.body,
      groupId: data.groupId,
      senderPeerId: data.senderPeerId,
    });
  });
};

const shutdownApp = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    tray?.destroy();
    tray = null;
    await stopEmbeddedRelay();
  } finally {
    app.exit(0);
  }
};

const enforceSingleInstanceLock = activeProfile === null;
const gotLock = enforceSingleInstanceLock ? app.requestSingleInstanceLock() : true;
if (!gotLock) {
  app.quit();
} else {
  if (enforceSingleInstanceLock) {
    app.on("second-instance", (_event, argv) => {
      for (const url of extractDeepLinks(argv)) enqueueDeepLink(url);
      focusMainWindow();
    });
  }

  app.on("open-url", (event, url) => {
    event.preventDefault();
    enqueueDeepLink(url);
  });

  app.whenReady().then(async () => {
    if (activeProfile) {
      console.log(`[electron] Running profile "${activeProfile}" at ${app.getPath("userData")}`);
    }
    app.setAsDefaultProtocolClient(APP_PROTOCOL);
    registerIpcHandlers();
    await startEmbeddedRelay();
    await createMainWindow();
    createTray();

    for (const url of extractDeepLinks(process.argv)) {
      enqueueDeepLink(url);
    }

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      } else {
        focusMainWindow();
      }
    });
  }).catch((error) => {
    console.error("Failed to start AnyPost Electron app:", error);
    void shutdownApp();
  });

  app.on("before-quit", (event) => {
    if (!shuttingDown) {
      event.preventDefault();
      void shutdownApp();
    }
  });
}
