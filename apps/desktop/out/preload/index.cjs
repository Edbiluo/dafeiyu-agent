"use strict";

// src/preload/index.ts
var import_electron = require("electron");
var api = {
  sendMessage: (request) => import_electron.ipcRenderer.invoke("agent:send-message", request),
  getRun: (runId) => import_electron.ipcRenderer.invoke("agent:get-run", runId),
  getMessages: (conversationId) => import_electron.ipcRenderer.invoke("agent:get-messages", conversationId),
  getMemory: (runId) => import_electron.ipcRenderer.invoke("agent:get-memory", runId),
  setWindowMode: (mode) => import_electron.ipcRenderer.invoke("window:set-mode", mode),
  roamWindow: () => import_electron.ipcRenderer.invoke("window:roam"),
  hideWindow: () => import_electron.ipcRenderer.invoke("window:hide"),
  quitApp: () => import_electron.ipcRenderer.invoke("window:quit"),
  showContextMenu: () => import_electron.ipcRenderer.invoke("window:context-menu")
};
import_electron.contextBridge.exposeInMainWorld("dafeiyu", api);
