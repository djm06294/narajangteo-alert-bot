// Neon Postgres 저장소.
// DATABASE_URL 이 있으면 lib/store.js 가 이걸 고른다.
import { neon } from '@neondatabase/serverless';
import { requireEnv } from './env.js';

export const STORE_KIND = 'neon';

let _sql = null;
let _ready = null;

/** 연결은 처음 쓸 때 만든다. 모듈을 불러오는 것만으로 터지지 않게 하기 위해서다. */
function sql() {
  if (!_sql) _sql = neon(requireEnv('DATABASE_URL'));
  return _sql;
}

/** 테이블이 없으면 만든다. 첫 질의 앞에서 한 번만 돈다. */
export function ready() {
  if (_ready) return _ready;
  const q = sql();

  _ready = (async () => {
    // 공고번호 + 차수가 열쇠다. 재공고로 차수가 오르면 다른 행이 되어 새 공고로 잡힌다.
    await q`create table if not exists sent_notices (
      bid_no    text not null,
      bid_ord   text not null,
      title     text,
      agency    text,
      bid_type  text,
      deadline  text,
      sent_at   timestamptz not null default now(),
      primary key (bid_no, bid_ord)
    )`;

    await q`create table if not exists alert_log (
      id       bigserial primary key,
      kind     text not null,
      bid_no   text,
      bid_ord  text,
      title    text,
      agency   text,
      bid_type text,
      deadline text,
      url      text,
      keyword  text,
      note     text,
      at       timestamptz not null default now()
    )`;
    await q`create index if not exists alert_log_at_idx on alert_log (at desc)`;

    // 규칙은 한 줄만 쓴다. 여러 사용자를 받게 되면 이 테이블에 사용자 열쇠를 더하면 된다.
    await q`create table if not exists settings (
      id         int primary key default 1,
      rules      jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )`;

    await q`create table if not exists favorites (
      id         text primary key,
      bid        jsonb not null,
      created_at timestamptz not null default now()
    )`;

    // 요청 횟수 제한. 서버리스 함수는 인스턴스마다 메모리가 따로라 카운터를 DB 에 둔다.
    await q`create table if not exists rate_limits (
      key          text not null,
      window_start timestamptz not null,
      count        int not null default 0,
      primary key (key, window_start)
    )`;

    // 공고 API 호출 수. 오퍼레이션마다 하루 한도가 있다.
    await q`create table if not exists api_usage (
      day       date not null,
      operation text not null,
      calls     int not null default 0,
      primary key (day, operation)
    )`;
  })();

  return _ready;
}

/* ---------- 보낸 공고 (중복 방지) ---------- */

export const sentKey = bid => `${bid.no}-${bid.ord}`;

export async function hasSent(bid) {
  await ready();
  const rows = await sql()`
    select 1 from sent_notices where bid_no = ${bid.no} and bid_ord = ${bid.ord} limit 1`;
  return rows.length > 0;
}

export async function markSent(bid) {
  await ready();
  // 같은 공고가 두 번 들어와도 조용히 넘어간다.
  await sql()`
    insert into sent_notices (bid_no, bid_ord, title, agency, bid_type, deadline)
    values (${bid.no}, ${bid.ord}, ${bid.title}, ${bid.agency}, ${bid.type}, ${bid.deadline})
    on conflict (bid_no, bid_ord) do nothing`;
}

export async function countSent() {
  await ready();
  const rows = await sql()`select count(*)::int as n from sent_notices`;
  return rows[0]?.n ?? 0;
}

/** 여러 건을 한 번에 확인한다. 공고마다 왕복하면 느리다. */
export async function filterUnsent(bids) {
  await ready();
  if (!bids.length) return [];
  const keys = bids.map(sentKey);
  const rows = await sql()`
    select bid_no, bid_ord from sent_notices
    where bid_no || '-' || bid_ord = any(${keys})`;
  const seen = new Set(rows.map(r => `${r.bid_no}-${r.bid_ord}`));
  return bids.filter(b => !seen.has(sentKey(b)));
}

/* ---------- 알림 이력 ---------- */

export async function logAlert(entry) {
  await ready();
  await sql()`
    insert into alert_log (kind, bid_no, bid_ord, title, agency, bid_type, deadline, url, keyword, note)
    values (${entry.kind}, ${entry.no ?? null}, ${entry.ord ?? null}, ${entry.title ?? null},
            ${entry.agency ?? null}, ${entry.type ?? null}, ${entry.deadline ?? null},
            ${entry.url ?? null}, ${entry.keyword ?? null}, ${entry.note ?? null})`;
}

export async function listAlerts(limit = 100) {
  await ready();
  const rows = await sql()`
    select kind, bid_no, bid_ord, title, agency, bid_type, deadline, url, keyword, note, at
    from alert_log order by at desc limit ${limit}`;

  // 파일 저장소와 같은 모양으로 맞춘다. 부르는 쪽은 차이를 모른다.
  return rows.map(r => ({
    kind: r.kind, no: r.bid_no, ord: r.bid_ord, title: r.title, agency: r.agency,
    type: r.bid_type, deadline: r.deadline, url: r.url, keyword: r.keyword,
    note: r.note, at: new Date(r.at).toISOString()
  }));
}

/* ---------- 알림 규칙 ---------- */

const DEFAULT_RULES = {
  keywords: [], excludes: [], types: ['공사', '용역', '물품'],
  lookback: 3, maxPrice: null, maxDaysLeft: null,
  interval: '30분마다', quietStart: '09:00', quietEnd: '19:00', weekend: false,
  fields: ['공고번호', '발주기관', '업무유형', '추정가격', '마감일시']
};

export async function getRules() {
  await ready();
  const rows = await sql()`select rules from settings where id = 1`;
  return { ...DEFAULT_RULES, ...(rows[0]?.rules ?? {}) };
}

export async function saveRules(patch) {
  const next = { ...(await getRules()), ...patch };
  await sql()`
    insert into settings (id, rules, updated_at) values (1, ${JSON.stringify(next)}::jsonb, now())
    on conflict (id) do update set rules = excluded.rules, updated_at = now()`;
  return next;
}

/* ---------- 요청 횟수 제한 ---------- */

/** key 의 현재 창(windowSec 단위로 자른 시간) 카운터를 1 올리고 올린 값을 돌려준다. */
export async function hitRateLimit(key, windowSec) {
  await ready();
  const ms = windowSec * 1000;
  const start = new Date(Math.floor(Date.now() / ms) * ms);

  // insert 와 update 를 한 문장으로 해야 동시에 들어온 요청이 서로의 증가분을 덮어쓰지 않는다.
  const rows = await sql()`
    insert into rate_limits (key, window_start, count) values (${key}, ${start.toISOString()}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`;

  // 지난 창은 가끔 치운다. 매번 지우면 요청마다 쿼리가 하나 더 붙는다.
  if (Math.random() < 0.02) {
    await sql()`delete from rate_limits where window_start < now() - interval '1 day'`;
  }

  return { count: rows[0].count, resetAt: new Date(start.getTime() + ms) };
}

/* ---------- 공고 API 사용량 ---------- */

export async function addApiUsage(day, operation, n = 1) {
  await ready();
  await sql()`
    insert into api_usage (day, operation, calls) values (${day}, ${operation}, ${n})
    on conflict (day, operation) do update set calls = api_usage.calls + ${n}`;
}

export async function getApiUsage(day, operation) {
  await ready();
  const rows = await sql()`select calls from api_usage where day = ${day} and operation = ${operation}`;
  return rows[0]?.calls ?? 0;
}

export async function listApiUsage(day) {
  await ready();
  const rows = await sql()`select operation, calls from api_usage where day = ${day}`;
  return Object.fromEntries(rows.map(r => [r.operation, r.calls]));
}

/* ---------- 즐겨찾기 ---------- */

export async function listFavorites() {
  await ready();
  const rows = await sql()`select bid from favorites order by created_at desc`;
  return rows.map(r => r.bid);
}

export async function addFavorite(bid) {
  await ready();
  await sql()`
    insert into favorites (id, bid) values (${bid.id}, ${JSON.stringify(bid)}::jsonb)
    on conflict (id) do update set bid = excluded.bid`;
}

export async function removeFavorite(id) {
  await ready();
  await sql()`delete from favorites where id = ${id}`;
}
