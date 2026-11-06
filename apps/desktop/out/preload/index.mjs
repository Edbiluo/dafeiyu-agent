import { contextBridge, ipcRenderer } from "electron";
const api = {
  sendMessage: (request) => ipcRenderer.invoke("agent:send-message", request),
  getRun: (runId) => ipcRenderer.invoke("agent:get-run", runId),
  getMessages: (conversationId) => ipcRenderer.invoke("agent:get-messages", conversationId),
  getMemory: (runId) => ipcRenderer.invoke("agent:get-memory", runId),
  hideWindow: () => ipcRenderer.invoke("window:hide"),
  quitApp: () => ipcRenderer.invoke("window:quit"),
  showContextMenu: () => ipcRenderer.invoke("window:context-menu")
};
contextBridge.exposeInMainWorld("dafeiyu", api);
