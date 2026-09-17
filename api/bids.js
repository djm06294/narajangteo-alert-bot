// GET /api/bids — 나라장터에서 최근 공고를 가져와 키워드 규칙을 적용해 돌려준다.
//
// 쿼리: keywords, excludes (쉼표 구분) / types (쉼표 구분) / days (조회 기간, 일)
//
// 인증키를 브라우저에 노출하지 않으려고 조회는 반드시 서버에서 한다.
import { fetchRecentBids, ALL_TYPES } from '../lib/g2b.js';
import { applyRules } from '../lib/filter.js';
import { rateLimit } from '../lib/ratelimit.js';

// IP 하나가 10분에 부를 수 있는 횟수. 화면은 키워드를 바꿀 때마다 한 번씩 부른다.
const LIMIT = Number(process.env.BIDS_RATE_LIMIT ?? 30);
const WINDOW_SEC = 10 * 60;

const csv = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { name: 'bids', limit: LIMIT, windowSec: WINDOW_SEC }))) return;

  // Vercel 은 req.query 를 주지만, 로컬 개발 서버도 같이 쓰려고 URL 에서 직접 읽는다.
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.searchParams;

  const keywords = csv(p.get('keywords'));
  const excludes = csv(p.get('excludes'));
  const types = csv(p.get('types'));
  const days = Math.min(Math.max(Number(p.get('days')) || 7, 1), 30);

  try {
    const now = new Date();
    const { bids, errors, range } = await fetchRecentBids({
      types: types.length ? types : ALL_TYPES,
      days,
      now,
      caller: 'search'
    });

    const { items, excludedCount } = applyRules(bids, { keywords, excludes }, now);

    // 마감 임박순이 기본. 마감일시가 없는 건은 뒤로 보낸다.
    items.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

    res.setHeader('content-type', 'application/json; charset=utf-8');
    // 같은 조건이면 1분간 재사용. 일일 호출 한도를 아끼기 위해서다.
    res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=120');
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      asOf: now.toISOString(),
      range,
      scanned: bids.length,
      total: items.length,
      excludedCount,
      partialErrors: errors?.length ? errors : undefined,
      items
    }));
  } catch (err) {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.statusCode = err.code === 'QUOTA' ? 429 : 502;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}
