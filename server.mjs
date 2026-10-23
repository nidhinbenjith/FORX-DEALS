import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const apiBase = process.env.JAVA_API_URL || 'http://127.0.0.1:8081';
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.ico':'image/x-icon' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try {
      const upstream = await fetch(new URL(url.pathname + url.search, apiBase), {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] || 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
        body: ['GET','HEAD'].includes(req.method) ? undefined : req,
        duplex: 'half'
      });
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.writeHead(502, { 'content-type':'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message:`The store API at ${apiBase} is unavailable. Start it with npm run start:api. ${error.message}` }));
    }
    return;
  }
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = resolve(root, `.${requested}`);
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'x-content-type-options':'nosniff' });
    res.end(content);
  } catch { res.writeHead(404, { 'content-type':'text/plain; charset=utf-8' }); res.end('Not found'); }
});
server.listen(port, () => console.log(`Forex Deals storefront: http://localhost:${port}`));


