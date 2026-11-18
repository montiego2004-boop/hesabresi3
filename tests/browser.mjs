// Browser-only dependencies are devDependencies and are never bundled into the PWA.
import { chromium } from 'playwright-core';
import bin from '@sparticuz/chromium';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
export async function browserOptions() {
  if (process.env.CHROME_PATH)
    return { executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] };
  const dir = await mkdtemp(join(tmpdir(), 'daneh-libs-'));
  const archive = brotliDecompressSync(
    await readFile(
      new URL('../node_modules/@sparticuz/chromium/bin/al2023.tar.br', import.meta.url),
    ),
  );
  const tar = spawnSync('tar', ['xf', '-', '-C', dir], { input: archive });
  if (tar.status !== 0) throw Error('Could not unpack Chromium test runtime');
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  return {
    executablePath: await bin.executablePath(),
    headless: true,
    args: bin.args.filter(
      (a) =>
        !a.includes('disable-web-security') &&
        !a.includes('allow-running-insecure-content') &&
        !a.includes('single-process'),
    ),
    env: {
      ...process.env,
      LD_LIBRARY_PATH: join(dir, 'lib') + ':' + (process.env.LD_LIBRARY_PATH || ''),
    },
  };
}
export { chromium };
