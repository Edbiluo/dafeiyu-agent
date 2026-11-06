import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'runtime-assets');
const target = resolve(root, 'out/renderer');
await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(resolve(root, 'src/renderer/index.html'), resolve(target, 'index.html')),
  copyFile(resolve(source, 'dafeiyu-q-transparent.png'), resolve(target, 'dafeiyu-q-transparent.png')),
  copyFile(
    resolve(source, 'dafeiyu-whale-girl-transparent.png'),
    resolve(target, 'dafeiyu-whale-girl-transparent.png'),
  ),
]);
console.log('Desktop character assets copied.');
