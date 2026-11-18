import { zipSync } from 'fflate';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
const files = {};
async function collect(dir, prefix = '') {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + f.name,
      name = prefix + f.name;
    if (f.isDirectory()) await collect(path, name + '/');
    else files[name] = new Uint8Array(await readFile(path));
  }
}
await collect('dist');
await mkdir('release', { recursive: true });
await writeFile('release/daneh-hesab-netlify.zip', zipSync(files, { level: 6 }));
console.log(
  'release/daneh-hesab-netlify.zip — unzip and deploy its contents, not the source repository.',
);
