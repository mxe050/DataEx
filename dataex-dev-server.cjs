// Local, read-only static server. No uploads, proxying, or external requests.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(__dirname);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
function withinRoot(file) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
const server = http.createServer(async (request, response) => {
  const end = (status, message = '') => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (!['GET', 'HEAD'].includes(request.method)) { request.resume(); return end(405, 'Read-only server'); }
  try {
    const url = new URL(request.url, 'http://127.0.0.1:8766');
    const name = decodeURIComponent(url.pathname);
    if (name === '/') {
      response.writeHead(302, { Location: '/dataex-chatgpt.html', 'Cache-Control': 'no-store' });
      return response.end();
    }
    if (name === '/favicon.ico') return end(204);
    if (name.includes('\0') || name.split(/[\\/]/).some(part => part.startsWith('.'))) return end(404);
    const file = path.resolve(root, '.' + name);
    if (!withinRoot(file)) return end(404);
    const realFile = await fs.promises.realpath(file);
    if (!withinRoot(realFile)) return end(404);
    const stat = await fs.promises.stat(realFile);
    if (!stat.isFile()) return end(404);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') return response.end();
    const stream = fs.createReadStream(realFile);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    end(error instanceof URIError ? 400 : 404);
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.on('error', error => { console.error('DataEx server:', error.code || error.message); process.exitCode = 1; });
server.listen(8766, '127.0.0.1');
