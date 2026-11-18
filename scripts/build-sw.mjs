import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const walk = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(dir + '/' + e.name) : dir + '/' + e.name,
      ),
    )
  ).flat();
const files = (await walk('dist'))
  .filter((p) => !['dist/sw.js', 'dist/_redirects', 'dist/_headers'].includes(p))
  .sort();
const resources = {};
for (const f of files)
  resources[f.slice(4)] = createHash('sha256')
    .update(await readFile(f))
    .digest('hex');
const code = await readFile('src/pwa/sw.js', 'utf8');
const version = createHash('sha256')
  .update(code)
  .update(JSON.stringify(resources))
  .digest('hex')
  .slice(0, 16);
await writeFile(
  'dist/sw.js',
  `const CACHE="daneh-shell-${version}";\nconst RESOURCES=${JSON.stringify(resources)};\n${code}`,
);
console.log(`Verified offline shell: ${files.length} resources • ${version}`);
