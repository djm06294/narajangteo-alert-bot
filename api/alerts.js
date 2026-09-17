// GET /api/alerts — 최근 알림 이력. 알림 이력 탭이 읽는다.
import { listAlerts, countSent, STORE_KIND } from '../lib/store.js';

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);

  const items = await listAlerts(limit);
  const total = await countSent();

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    store: STORE_KIND,           // 'file' — Neon 을 붙이면 'neon'
    totalSent: total,
    sentCount: items.filter(a => a.kind === 'sent').length,
    items
  }));
}
