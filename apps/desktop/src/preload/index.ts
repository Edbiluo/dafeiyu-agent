import { contextBridge, ipcRenderer } from 'electron';
import type { SendMessageRequest } from '@dafeiyu/contracts';
import type {
  DafeiyuDesktopApi,
  DesktopWindowMode,
} from '../shared/contracts.js';

const api: DafeiyuDesktopApi = {
  sendMessage: (request: SendMessageRequest) => ipcRenderer.invoke('agent:send-message', request),
  getRun: (runId: string) => ipcRenderer.invoke('agent:get-run', runId),
  getMessages: (conversationId: string) =>
    ipcRenderer.invoke('agent:get-messages', conversationId),
  getMemory: (runId: string) => ipcRenderer.invoke('agent:get-memory', runId),
  setWindowMode: (mode: DesktopWindowMode) =>
    ipcRenderer.invoke('window:set-mode', mode),
  roamWindow: () => ipcRenderer.invoke('window:roam'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  quitApp: () => ipcRenderer.invoke('window:quit'),
  showContextMenu: () => ipcRenderer.invoke('window:context-menu'),
};

contextBridge.exposeInMainWorld('dafeiyu', api);
