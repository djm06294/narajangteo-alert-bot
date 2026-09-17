// IP별 요청 횟수 제한.
import { hitRateLimit } from './store.js';

/** 요청한 쪽 IP. Vercel 이 넣어주는 헤더를 먼저 본다(클라이언트가 위조할 수 없다). */
export function clientIp(req) {
  const h = req.headers;
  const first = v => String(v || '').split(',')[0].trim();
  return first(h['x-vercel-forwarded-for'])
    || first(h['x-real-ip'])
    || first(h['x-forwarded-for'])
    || req.socket?.remoteAddress
    || 'unknown';
}

/**
 * 제한을 넘으면 429 를 쓰고 false 를 돌려준다.
 *
 * 카운터 저장소(DB)가 실패하면 통과시킨다. DB 장애 하나로 검색 전체가 막히는 것보다
 * 잠깐 제한이 풀리는 편이 낫다고 봤다. 공고 API 한도는 lib/g2b.js 가 따로 지킨다.
 */
export async function rateLimit(req, res, { name, limit, windowSec }) {
  let result;
  try {
    result = await hitRateLimit(`${name}:${clientIp(req)}`, windowSec);
  } catch (err) {
    console.error('rate limit 저장소 오류 — 통과시킴:', err.message);
    return true;
  }

  const remaining = Math.max(0, limit - result.count);
  res.setHeader('x-ratelimit-limit', String(limit));
  res.setHeader('x-ratelimit-remaining', String(remaining));

  if (result.count <= limit) return true;

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.setHeader('retry-after', String(retryAfter));
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.statusCode = 429;
  res.end(JSON.stringify({
    ok: false,
    rateLimited: true,
    retryAfter,
    error: `요청이 너무 많습니다. ${Math.ceil(retryAfter / 60)}분 뒤에 다시 시도하세요.`
  }));
  return false;
}
