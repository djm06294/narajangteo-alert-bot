// /api/favorites — 즐겨찾기.
//   GET                     목록
//   POST   (본문: 공고)      담기
//   DELETE ?id=...          빼기
//
// 사용자 구분은 없다. 이 앱을 쓰는 사람이 하나라는 전제다.
// 여러 명이 쓰게 되면 favorites 테이블에 사용자 열쇠를 더해야 한다.
import { listFavorites, addFavorite, removeFavorite } from '../lib/store.js';
import { readJson } from '../lib/http.js';

/** 클라이언트가 보낸 것 중 화면에 쓰는 항목만 추린다. */
function clean(body) {
  const str = v => v == null ? '' : String(v);
  return {
    id: str(body.id), no: str(body.no), ord: str(body.ord || '000'),
    title: str(body.title), agency: str(body.agency), demandAgency: str(body.demandAgency),
    type: str(body.type),
    price: body.price == null ? null : Number(body.price),
    priceSource: str(body.priceSource),
    posted: str(body.posted), postedAt: str(body.postedAt),
    deadline: str(body.deadline), opensAt: str(body.opensAt),
    method: str(body.method), region: str(body.region), kind: str(body.kind),
    url: str(body.url),
    matched: Array.isArray(body.matched) ? body.matched.map(str) : []
  };
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const reply = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };

  try {
    if (req.method === 'POST') {
      const body = await readJson(req);

      // 한 번에 여러 건 — 브라우저에 있던 즐겨찾기를 옮겨올 때 쓴다.
      if (Array.isArray(body.items)) {
        const rows = body.items.map(clean).filter(b => b.id && b.title);
        for (const bid of rows) await addFavorite(bid);
        return reply(200, { ok: true, added: rows.length, items: await listFavorites() });
      }

      const bid = clean(body);
      if (!bid.id || !bid.title) return reply(400, { ok: false, error: 'id 와 공고명이 필요합니다' });
      await addFavorite(bid);
      return reply(200, { ok: true, items: await listFavorites() });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id');
      if (!id) return reply(400, { ok: false, error: 'id 가 필요합니다' });
      await removeFavorite(id);
      return reply(200, { ok: true, items: await listFavorites() });
    }

    return reply(200, { ok: true, items: await listFavorites() });
  } catch (err) {
    return reply(500, { ok: false, error: err.message });
  }
}
