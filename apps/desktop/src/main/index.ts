import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from 'electron';
import {
  acceptedMessageResponseSchema,
  agentRunSchema,
  messageDtoSchema,
  sendMessageRequestSchema,
  uuidSchema,
} from '@dafeiyu/contracts';
import type { DesktopWindowMode } from '../shared/contracts.js';

const envPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);
const apiUrl = process.env.API_URL?.trim() || 'http://127.0.0.1:3100';
const WINDOW_SIZES: Record<DesktopWindowMode, { width: number; height: number }> = {
  pet: { width: 260, height: 420 },
  chat: { width: 380, height: 600 },
};

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let roaming = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  void app.whenReady().then(() => {
    registerIpc();
    createWindow();
    createTray();
  });
}

app.on('window-all-closed', () => {
  // Keep the tray process alive when the pet window is hidden.
});
app.on('before-quit', () => {
  quitting = true;
});

function createWindow(): void {
  const workArea = screen.getPrimaryDisplay().workArea;
  const size = WINDOW_SIZES.pet;
  mainWindow = new BrowserWindow({
    ...size,
    minWidth: 220,
    minHeight: 340,
    x: workArea.x + workArea.width - size.width - 18,
    y: workArea.y + workArea.height - size.height - 18,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    show: false,
    skipTaskbar: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

function createTray(): void {
  const assetPath = join(import.meta.dirname, '../renderer/dafeiyu-q-transparent.png');
  const icon = nativeImage.createFromPath(assetPath).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip('大肥鱼 Agent');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示大肥鱼', click: () => showWindow() },
      { label: '隐藏', click: () => mainWindow?.hide() },
      { type: 'separator' },
      { label: '退出', click: () => quitApp() },
    ]),
  );
  tray.on('double-click', () => showWindow());
}

function registerIpc(): void {
  ipcMain.handle('agent:send-message', async (_event, raw: unknown) => {
    const request = sendMessageRequestSchema.parse(raw);
    return acceptedMessageResponseSchema.parse(
      await requestJson('/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }),
    );
  });
  ipcMain.handle('agent:get-run', async (_event, runId: unknown) => {
    const id = uuidSchema.parse(runId);
    return agentRunSchema.parse(await requestJson(`/v1/runs/${id}`));
  });
  ipcMain.handle('agent:get-messages', async (_event, conversationId: unknown) => {
    const id = uuidSchema.parse(conversationId);
    const response = (await requestJson(`/v1/conversations/${id}/messages`)) as {
      messages?: unknown;
    };
    return messageDtoSchema.array().parse(response.messages);
  });
  ipcMain.handle('agent:get-memory', async (_event, runId: unknown) => {
    const id = uuidSchema.parse(runId);
    return requestJson(`/v1/runs/${id}/memory`);
  });
  ipcMain.handle('window:set-mode', (_event, rawMode: unknown) => {
    if (rawMode !== 'pet' && rawMode !== 'chat') return;
    resizeWindow(rawMode);
  });
  ipcMain.handle('window:roam', () => roamWindow());
  ipcMain.handle('window:hide', () => mainWindow?.hide());
  ipcMain.handle('window:quit', () => quitApp());
  ipcMain.handle('window:context-menu', () => showPetMenu());
}

function resizeWindow(mode: DesktopWindowMode): void {
  if (!mainWindow) return;
  const current = mainWindow.getBounds();
  const size = WINDOW_SIZES[mode];
  const workArea = screen.getDisplayMatching(current).workArea;
  const right = current.x + current.width;
  const bottom = current.y + current.height;
  const x = clamp(right - size.width, workArea.x, workArea.x + workArea.width - size.width);
  const y = clamp(bottom - size.height, workArea.y, workArea.y + workArea.height - size.height);
  mainWindow.setBounds({ x, y, ...size }, true);
}

async function roamWindow(): Promise<void> {
  if (!mainWindow || roaming || !mainWindow.isVisible()) return;
  roaming = true;
  try {
    const start = mainWindow.getBounds();
    const area = screen.getDisplayMatching(start).workArea;
    const targetX = randomInteger(area.x + 8, area.x + area.width - start.width - 8);
    const targetY = randomInteger(
      area.y + Math.round(area.height * 0.25),
      area.y + area.height - start.height - 8,
    );
    const steps = 70;
    for (let step = 1; step <= steps; step += 1) {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const progress = step / steps;
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      mainWindow.setPosition(
        Math.round(start.x + (targetX - start.x) * eased),
        Math.round(start.y + (targetY - start.y) * eased),
      );
      await delay(16);
    }
  } finally {
    roaming = false;
  }
}

function showPetMenu(): void {
  const menu = Menu.buildFromTemplate([
    { label: '打开对话', click: () => { showWindow(); resizeWindow('chat'); } },
    { label: '散步一下', click: () => void roamWindow() },
    { label: '隐藏大肥鱼', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]);
  if (mainWindow) menu.popup({ window: mainWindow });
  else menu.popup();
}

function showWindow(): void {
  mainWindow?.show();
  mainWindow?.focus();
}

function quitApp(): void {
  quitting = true;
  app.quit();
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(65_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent API ${response.status}: ${body.slice(0, 500)}`);
  }
  return response.json();
}

function randomInteger(minimum: number, maximum: number): number {
  if (maximum <= minimum) return minimum;
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
