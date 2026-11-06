import type { DafeiyuDesktopApi } from '../../shared/contracts.js';

declare global {
  interface Window {
    dafeiyu: DafeiyuDesktopApi;
  }
}

export {};
