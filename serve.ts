// A small static server for game/ (Node standard library only).
// `node serve.ts --port 8080` serves the playable folder on 127.0.0.1. It is a
// development convenience: it serves only game/, refuses path escapes, handles
// HEAD, byte ranges and conditional requests, never lists directories, and
// adds the headers a static offline game should have.

import { createReadStream, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const argv = process.argv.slice(2);

function readPort(): number {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      const parsed = Number(argv[i + 1]);
      if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
    }
    if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice(7));
      if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
    }
  }
  return 8080;
}

function readHost(): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host' && argv[i + 1]) return argv[i + 1];
    if (arg.startsWith('--host=')) return arg.slice(7);
  }
  return '127.0.0.1';
}

const port = readPort();
const host = readHost();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
};

function sendText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS });
  response.end(text);
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
    response.end('method not allowed');
    return;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendText(response, 400, 'bad request');
    return;
  }
  if (pathname.includes('\0')) {
    sendText(response, 400, 'bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    sendText(response, 403, 'forbidden');
    return;
  }

  let stats;
  try {
    stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
  } catch {
    sendText(response, 404, 'not found');
    return;
  }

  const etag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, { etag, 'cache-control': 'no-store', ...SECURITY_HEADERS });
    response.end();
    return;
  }

  const headers: Record<string, string | number> = {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    etag,
    'accept-ranges': 'bytes',
    ...SECURITY_HEADERS,
  };

  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const size = stats.size;
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < size) {
        headers['content-length'] = end - start + 1;
        headers['content-range'] = `bytes ${start}-${end}/${size}`;
        response.writeHead(206, headers);
        if (request.method === 'HEAD') response.end();
        else createReadStream(file, { start, end }).pipe(response);
        return;
      }
      response.writeHead(416, { 'content-range': `bytes */${size}` });
      response.end();
      return;
    }
  }

  headers['content-length'] = stats.size;
  response.writeHead(200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`port ${port} is already in use; try --port ${port + 1}`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Leonida Heat is on http://${host}:${port} (serving ${root})`);
  console.log('Press Ctrl+C to stop. The game makes no network requests at runtime.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 400).unref();
  });
}
