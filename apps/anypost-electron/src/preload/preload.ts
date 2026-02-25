const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

type RelayState = {
  readonly running: boolean;
  readonly peerId?: string;
  readonly listenAddrs: readonly string[];
  readonly lastError?: string;
};

const desktopApi = {
  getRelayState: (): Promise<RelayState> => ipcRenderer.invoke("anypost:get-relay-state"),
  onRelayState: (listener: (state: RelayState) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: RelayState) => {
      listener(state);
    };
    ipcRenderer.on("anypost:relay-state-update", wrapped);
    return () => ipcRenderer.removeListener("anypost:relay-state-update", wrapped);
  },
  onDeepLink: (listener: (url: string) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, url: string) => {
      listener(url);
    };
    ipcRenderer.on("anypost:deep-link", wrapped);
    return () => ipcRenderer.removeListener("anypost:deep-link", wrapped);
  },
  getPendingDeepLinks: (): Promise<readonly string[]> => ipcRenderer.invoke("anypost:get-pending-deep-links"),
  notifyMessage: (payload: {
    readonly title: string;
    readonly body: string;
    readonly groupId: string;
    readonly senderPeerId: string;
  }): void => {
    ipcRenderer.send("anypost:notify-message", payload);
  },
};

contextBridge.exposeInMainWorld("anypostDesktop", desktopApi);
