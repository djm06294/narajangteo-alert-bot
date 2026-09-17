// 로컬 개발 서버. 정적 파일을 주고 /api/* 는 api 폴더의 핸들러로 넘긴다.
// Vercel 에 올리면 이 파일은 쓰이지 않는다. 거기서는 api/*.js 가 각각 함수로 배포된다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from '../lib/env.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.replace('/api/', '').replace(/\/$/, '');
    const file = path.join(root, 'api', `${name}.js`);

    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: `no such endpoint: ${name}` }));
    }

    try {
      // 파일이 바뀌면 다시 읽도록 쿼리를 붙여 모듈 캐시를 우회한다.
      const mod = await import(`${pathToFileURL(file).href}?t=${fs.statSync(file).mtimeMs}`);
      await mod.default(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // 정적 파일은 public/ 에서 준다. Vercel 도 같은 폴더를 정적으로 서빙한다.
  const staticRoot = path.join(root, 'public');
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const file = path.join(staticRoot, rel);
  if (!file.startsWith(staticRoot)) {
    res.writeHead(403);
    return res.end('forbidden');
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log(`나라장터 알림봇 → http://localhost:${PORT}`);
  if (!process.env.G2B_SERVICE_KEY) {
    console.warn('주의: G2B_SERVICE_KEY 가 없습니다. .env 를 확인하세요.');
  }
});
