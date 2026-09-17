// 관리자 비밀번호 검사. 텔레그램 전송·규칙 변경·즐겨찾기 변경처럼 "쓰는" 요청에만 건다.
//
// ADMIN_PASSWORD 가 없으면(로컬) 검사하지 않는다. 배포본에만 설정한다.
// 브라우저는 x-admin-password 헤더에 encodeURIComponent 한 값을 실어 보낸다.
// (헤더에는 한글을 그대로 못 싣기 때문이다.)
import crypto from 'node:crypto';
import { loadEnv } from './env.js';

// 길이가 달라도 비교 시간이 같도록 해시끼리 비교한다.
const digest = s => crypto.createHash('sha256').update(String(s)).digest();

export function adminRequired() {
  loadEnv();
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function isAdmin(req) {
  loadEnv();
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return true;

  const raw = req.headers['x-admin-password'];
  if (typeof raw !== 'string' || !raw) return false;

  let given;
  try { given = decodeURIComponent(raw); } catch { return false; }

  return crypto.timingSafeEqual(digest(given), digest(expected));
}

/** 통과 못 하면 401 을 쓰고 false 를 돌려준다. */
export function guardAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.statusCode = 401;
  res.end(JSON.stringify({ ok: false, needAdmin: true, error: '관리자 비밀번호가 필요합니다' }));
  return false;
}
