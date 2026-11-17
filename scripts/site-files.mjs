import { readFile, lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = new URL('../', import.meta.url);

const sources = ['index.html', 'style.css', 'hub.mjs', 'games.json'];
const filePath = /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/;
const gameDirectory = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export async function listSiteFiles() {
  const { sharedFiles, games } = JSON.parse(await readFile(new URL('games.json', root), 'utf8'));
  const files = new Set(sources);
  const directories = new Set();
  if (!Array.isArray(games) || !Array.isArray(sharedFiles)) throw new TypeError('Invalid games.json catalog.');

  function addFile(path) {
    if (typeof path !== 'string' || !filePath.test(path)) throw new Error(`Invalid public file path: ${path}`);
    files.add(path);
  }

  for (const path of sharedFiles) {
    if (typeof path !== 'string' || !path.startsWith('shared/')) {
      throw new Error(`Shared assets belong in shared/: ${path}`);
    }
    addFile(path);
  }
  for (const { directory, title, description, files: assets } of games) {
    if (typeof directory !== 'string' || !gameDirectory.test(directory) || directories.has(directory.toLowerCase())) {
      throw new Error(`Invalid or duplicate game directory: ${directory}`);
    }
    if (typeof title !== 'string' || !title.trim() || typeof description !== 'string' || !Array.isArray(assets)) {
      throw new Error(`Invalid game catalog entry: ${directory}`);
    }
    directories.add(directory.toLowerCase());
    addFile(`${directory}/index.html`);
    for (const path of assets) addFile(`${directory}/${path}`);
  }

  const project = await realpath(root);
  const paths = new Map();
  for (const path of files) {
    const source = fileURLToPath(new URL(path, root));
    const metadata = await lstat(source);
    if (!metadata.isFile()) throw new Error(`Public path must be a regular file: ${path}`);
    const withinProject = relative(project, await realpath(source));
    if (isAbsolute(withinProject) || withinProject.split(sep)[0] === '..') {
      throw new Error(`Public file points outside the project: ${path}`);
    }
    paths.set(path, source);
  }
  return paths;
}
