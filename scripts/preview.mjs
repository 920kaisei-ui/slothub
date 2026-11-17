import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { listSiteFiles } from './site-files.mjs';

const port = Number(process.argv[2] ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535.');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const files = await listSiteFiles();
    const { pathname, search } = new URL(request.url, 'http://localhost');
    const relative = pathname.slice(1);
    const file = relative.endsWith('/') || relative === '' ? `${relative}index.html` : relative;
    if (!files.has(file)) {
      if (files.has(`${relative}/index.html`)) {
        response.writeHead(308, { Location: `${pathname}/${search}` }).end();
      } else {
        response.writeHead(404).end('Not found');
      }
      return;
    }
    const body = await readFile(files.get(file));
    response.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': body.length,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Could not serve a site file.');
  }
});

await listSiteFiles();
server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
