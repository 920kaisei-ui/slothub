import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { listSiteFiles, root } from './site-files.mjs';

const name = process.argv[2] ?? '_site';
if (!/^_site(?:-[a-zA-Z0-9-]+)?$/.test(name)) throw new Error('Use _site or an _site-* directory name.');
const files = await listSiteFiles();
const output = new URL(`${name}/`, root);

// Create a fresh destination so files from removed games cannot reach another build.
await mkdir(output);
for (const [path, source] of files) {
  const destination = new URL(path, output);
  await mkdir(new URL('./', destination), { recursive: true });
  await copyFile(source, destination);
}
console.log(`Packaged ${files.size} files in ${fileURLToPath(output)}`);
