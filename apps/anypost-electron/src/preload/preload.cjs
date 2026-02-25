const { contextBridge, ipcRenderer } = require("electron");

const desktopApi = {
  getRelayState: () => ipcRenderer.invoke("anypost:get-relay-state"),
  onRelayState: (listener) => {
    const wrapped = (_event, state) => {
      listener(state);
    };
    ipcRenderer.on("anypost:relay-state-update", wrapped);
    return () => ipcRenderer.removeListener("anypost:relay-state-update", wrapped);
  },
  onDeepLink: (listener) => {
    const wrapped = (_event, url) => {
      listener(url);
    };
    ipcRenderer.on("anypost:deep-link", wrapped);
    return () => ipcRenderer.removeListener("anypost:deep-link", wrapped);
  },
  getPendingDeepLinks: () => ipcRenderer.invoke("anypost:get-pending-deep-links"),
  notifyMessage: (payload) => {
    ipcRenderer.send("anypost:notify-message", payload);
  },
};

contextBridge.exposeInMainWorld("anypostDesktop", desktopApi);
