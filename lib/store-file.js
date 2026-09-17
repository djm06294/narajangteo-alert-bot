// 파일 저장소. .data/ 폴더의 JSON 에 쓴다. 로컬 개발용.
//
// Neon 구현(store-neon.js)과 함수 모양을 맞추려고 전부 async 로 둔다.
// 실제 동작은 동기지만, 부르는 쪽이 둘을 구분하지 않아도 되게 하기 위해서다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.data');

const FILES = {
  sent: path.join(dir, 'sent-notices.json'),
  alerts: path.join(dir, 'alert-log.json'),
  rules: path.join(dir, 'rules.json'),
  favorites: path.join(dir, 'favorites.json')
};

export const STORE_KIND = 'file';

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(file, value) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

/* ---------- 보낸 공고 (중복 방지) ---------- */

/** 공고 하나의 열쇠. 차수가 오르면 재공고이므로 새 공고로 본다. */
export const sentKey = bid => `${bid.no}-${bid.ord}`;

export async function hasSent(bid) {
  return Boolean(read(FILES.sent, {})[sentKey(bid)]);
}

export async function markSent(bid) {
  const sent = read(FILES.sent, {});
  sent[sentKey(bid)] = {
    no: bid.no, ord: bid.ord, title: bid.title, agency: bid.agency,
    type: bid.type, deadline: bid.deadline, sentAt: new Date().toISOString()
  };
  write(FILES.sent, sent);
}

export async function countSent() {
  return Object.keys(read(FILES.sent, {})).length;
}

export async function filterUnsent(bids) {
  const sent = read(FILES.sent, {});
  return bids.filter(b => !sent[sentKey(b)]);
}

/* ---------- 알림 이력 ---------- */

/** kind: sent | dup | blocked | error | run */
export async function logAlert(entry) {
  const log = read(FILES.alerts, []);
  log.unshift({ ...entry, at: new Date().toISOString() });
  write(FILES.alerts, log.slice(0, 500));   // 최근 500건만 둔다
}

export async function listAlerts(limit = 100) {
  return read(FILES.alerts, []).slice(0, limit);
}

/* ---------- 알림 규칙 ---------- */
// 브라우저 localStorage 는 크론이 읽을 수 없다. 자동 실행에 쓸 규칙은 서버에 둬야 한다.

const DEFAULT_RULES = {
  keywords: [], excludes: [], types: ['공사', '용역', '물품'],
  lookback: 3,
  maxPrice: null,     // 억원. null 이면 제한 없음
  maxDaysLeft: null,  // 마감까지 남은 날 상한. null 이면 제한 없음
  interval: '30분마다', quietStart: '09:00', quietEnd: '19:00', weekend: false,
  fields: ['공고번호', '발주기관', '업무유형', '추정가격', '마감일시']
};

export async function getRules() {
  return { ...DEFAULT_RULES, ...read(FILES.rules, {}) };
}

export async function saveRules(patch) {
  const next = { ...(await getRules()), ...patch };
  write(FILES.rules, next);
  return next;
}

/* ---------- 요청 횟수 제한 ---------- */
// 로컬은 프로세스가 하나라 메모리로 충분하다.

const hits = new Map();

export async function hitRateLimit(key, windowSec) {
  const ms = windowSec * 1000;
  const start = Math.floor(Date.now() / ms) * ms;
  const k = `${key}|${start}`;
  const count = (hits.get(k) || 0) + 1;
  hits.set(k, count);
  for (const old of hits.keys()) {
    if (Number(old.split('|').pop()) < start) hits.delete(old);
  }
  return { count, resetAt: new Date(start + ms) };
}

/* ---------- 공고 API 사용량 ---------- */

const USAGE = path.join(dir, 'api-usage.json');

export async function addApiUsage(day, operation, n = 1) {
  const usage = read(USAGE, {});
  usage[day] = usage[day] || {};
  usage[day][operation] = (usage[day][operation] || 0) + n;
  // 오늘 것만 남긴다.
  write(USAGE, { [day]: usage[day] });
  return usage[day][operation];
}

export async function getApiUsage(day, operation) {
  return read(USAGE, {})[day]?.[operation] ?? 0;
}

export async function listApiUsage(day) {
  return read(USAGE, {})[day] || {};
}

/* ---------- 즐겨찾기 ---------- */

export async function listFavorites() {
  return Object.values(read(FILES.favorites, {}));
}

export async function addFavorite(bid) {
  const favs = read(FILES.favorites, {});
  favs[bid.id] = bid;
  write(FILES.favorites, favs);
}

export async function removeFavorite(id) {
  const favs = read(FILES.favorites, {});
  delete favs[id];
  write(FILES.favorites, favs);
}
