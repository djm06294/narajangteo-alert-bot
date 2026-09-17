// 조달청 나라장터 입찰공고정보서비스 클라이언트.
// 참고문서: 조달청_OpenAPI참고자료_나라장터_입찰공고정보서비스_1.2.docx
import { requireEnv } from './env.js';
import { addApiUsage, getApiUsage, logAlert } from './store.js';
import { sendMessage, isConfigured } from './telegram.js';

const BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService';

// 업무유형별 오퍼레이션. 개발계정 기준 각각 하루 1000회까지 호출할 수 있다.
export const OPERATIONS = {
  공사: 'getBidPblancListInfoCnstwk',
  용역: 'getBidPblancListInfoServc',
  물품: 'getBidPblancListInfoThng',
  외자: 'getBidPblancListInfoFrgcpt'
};

export const ALL_TYPES = Object.keys(OPERATIONS);

const ROWS_PER_PAGE = 999;   // 한 번에 받는 건수
const MAX_PAGES = 4;         // 유형당 최대 페이지 (호출 수 상한)
const CACHE_TTL_MS = 10 * 60 * 1000;

// 개발계정 한도는 오퍼레이션당 하루 1,000회다. 검색이 이만큼 쓰면 더는 새로 조회하지 않고,
// 나머지는 저녁 9시 알림(크론)이 쓰도록 남긴다. 크론은 이 제한을 받지 않는다.
const SEARCH_DAILY_CALL_LIMIT = Number(process.env.SEARCH_DAILY_CALL_LIMIT ?? 700);

// 나라장터 개발계정의 하루 호출 한도(오퍼레이션마다).
const DAILY_CALL_LIMIT = Number(process.env.G2B_DAILY_CALL_LIMIT ?? 1000);

/**
 * 사용량 경고 기준선. 호출 수가 이 값을 "정확히" 밟는 순간 한 번 알린다.
 * 카운터는 1씩, 한 문장으로 올라가므로 같은 기준선을 밟는 요청은 하루에 하나뿐이다.
 * 그래서 "보냈는지" 따로 기록하지 않아도 중복 알림이 나지 않는다.
 */
function usageThresholds() {
  const S = SEARCH_DAILY_CALL_LIMIT, D = DAILY_CALL_LIMIT;
  return [
    { at: Math.floor(S * 0.8), level: '주의',
      text: `검색 예산 ${S}회 중 80%를 썼습니다.` },
    { at: S, level: '경고',
      text: `검색 예산 ${S}회를 다 썼습니다. 오늘은 검색으로 새로 조회하지 않고, 남은 ${Math.max(0, D - S)}회는 저녁 알림에 씁니다.` },
    { at: Math.floor(D * 0.9), level: '위험',
      text: `하루 한도 ${D}회 중 90%를 썼습니다. 한도를 넘으면 저녁 알림이 실패합니다.` }
  ].filter(t => t.at >= 1);
}

/** 호출 한 번을 세고, 기준선을 밟았으면 알린다. 어떤 실패도 조회를 막지 않는다. */
async function recordUsage(type) {
  const day = usageDay();
  let calls;
  try {
    calls = await addApiUsage(day, OPERATIONS[type], 1);
  } catch (err) {
    console.error('사용량 기록 실패:', err.message);
    return;
  }

  const crossed = usageThresholds().filter(t => t.at === calls);
  for (const t of crossed) await warnUsage(type, day, calls, t);
}

async function warnUsage(type, day, calls, threshold) {
  const title = `공고 API 사용량 ${threshold.level} · ${type}`;

  try {
    await logAlert({ kind: 'warn', title, note: `${calls}/${DAILY_CALL_LIMIT}회 — ${threshold.text}` });
  } catch (err) {
    console.error('사용량 경고 기록 실패:', err.message);
  }

  if (!isConfigured()) return;
  try {
    await sendMessage(
      `⚠️ <b>${title}</b>

` +
      `오늘(${day}) ${calls.toLocaleString()}회 / 하루 한도 ${DAILY_CALL_LIMIT.toLocaleString()}회
` +
      threshold.text
    );
  } catch (err) {
    console.error('사용량 경고 전송 실패:', err.message);
  }
}

/** 한도는 한국 날짜 기준으로 센다. */
export const usageDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);   // YYYY-MM-DD

/** 한도 초과 오류. 부르는 쪽이 429 로 바꿔 돌려준다. */
export class QuotaError extends Error {
  constructor(message) { super(message); this.code = 'QUOTA'; }
}

// 같은 조건으로 연달아 조회할 때 일일 호출 한도를 태우지 않도록 잠깐 캐시한다.
const cache = new Map();
// 진행 중인 조회. 같은 조건이 겹쳐 들어와도 한 번만 부른다.
const inflight = new Map();

const pad = n => String(n).padStart(2, '0');

/** Date → API 가 요구하는 "YYYYMMDDHHMM" */
export function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** "2026-09-23 16:00:00" → "2026-09-23 16:00" */
function trimSeconds(dt) {
  return typeof dt === 'string' && dt.length >= 16 ? dt.slice(0, 16) : (dt || '');
}

/** 원 단위 문자열 → 억원 단위 숫자. 값이 없거나 0이면 null. */
function toEok(won) {
  const n = Number(won);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n / 1e8;
}

/** API 응답 한 건을 화면이 쓰는 모양으로 바꾼다. */
function normalize(item, type) {
  const no = item.bidNtceNo || '';
  const ord = item.bidNtceOrd || '000';
  const method = [item.cntrctCnclsMthdNm, item.sucsfbidMthdNm]
    .filter(Boolean).join(' / ') || '—';
  // 목록 응답에는 참가가능지역이 없다. 공동계약 의무지역이 있으면 그것만 보여준다.
  const region = [item.jntcontrctDutyRgnNm1, item.jntcontrctDutyRgnNm2, item.jntcontrctDutyRgnNm3]
    .filter(Boolean).join(', ') || '제한 없음';

  return {
    id: `${no}-${ord}`,
    no,
    ord,
    title: item.bidNtceNm || '(공고명 없음)',
    agency: item.ntceInsttNm || '',
    demandAgency: item.dminsttNm || '',
    type,
    // 추정가격이 없으면 예산금액으로 대신한다. 둘 다 없으면 null.
    price: toEok(item.presmptPrce) ?? toEok(item.asignBdgtAmt) ?? toEok(item.bdgtAmt),
    priceSource: item.presmptPrce && Number(item.presmptPrce) > 0 ? '추정가격' : '예산금액',
    posted: (item.bidNtceDt || '').slice(0, 10),
    postedAt: trimSeconds(item.bidNtceDt),
    deadline: trimSeconds(item.bidClseDt),
    opensAt: trimSeconds(item.opengDt),
    method,
    region,
    kind: item.ntceKindNm || '',          // 등록공고 / 변경공고 / 취소공고 / 재공고
    reNotice: item.reNtceYn === 'Y',
    url: item.bidNtceDtlUrl || item.bidNtceUrl || ''
  };
}

/**
 * 한 업무유형을 등록일시 범위로 조회한다. 페이지를 끝까지(상한까지) 넘긴다.
 * 캐시 키에 조회 시각을 넣으면 1분마다 키가 달라져 캐시가 무용지물이 되므로,
 * 키는 "유형 + 기간 길이" 로만 만든다(cacheKey).
 */
async function fetchType(type, bgnDt, endDt, cacheKey, caller = 'cron') {
  const key = cacheKey || `${type}|${bgnDt}|${endDt}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  // 같은 조건의 조회가 이미 날아가 있으면 그 약속을 같이 기다린다.
  const pending = inflight.get(key);
  if (pending) return pending;

  // 캐시에 없어 새로 불러야 할 때만 한도를 확인한다. 캐시 적중은 한도를 쓰지 않는다.
  if (caller === 'search') {
    let used = 0;
    try { used = await getApiUsage(usageDay(), OPERATIONS[type]); }
    catch (err) { console.error('사용량 조회 실패 — 통과시킴:', err.message); }
    if (used >= SEARCH_DAILY_CALL_LIMIT) {
      throw new QuotaError(`오늘 검색용 API 호출 한도(${SEARCH_DAILY_CALL_LIMIT}회)를 다 썼습니다. 저녁 알림 몫은 남겨뒀습니다.`);
    }
  }

  const job = runFetch(type, bgnDt, endDt)
    .then(items => {
      cache.set(key, { at: Date.now(), items });
      return items;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

/** 한 페이지를 받아 {rows, total} 로 돌려준다. */
async function fetchPage(type, bgnDt, endDt, page) {
  const serviceKey = requireEnv('G2B_SERVICE_KEY');
  const url = `${BASE}/${OPERATIONS[type]}?serviceKey=${encodeURIComponent(serviceKey)}` +
    `&type=json&inqryDiv=1&inqryBgnDt=${bgnDt}&inqryEndDt=${endDt}` +
    `&pageNo=${page}&numOfRows=${ROWS_PER_PAGE}`;

  const res = await fetch(url, { headers: { accept: 'application/json' } });

  // 응답이 실패여도 호출은 한 번 쓴 것이다. 기록이나 경고에 실패해도 조회는 계속한다.
  await recordUsage(type);

  if (!res.ok) throw new Error(`${type} 조회 실패: HTTP ${res.status}`);

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증키 오류 등은 JSON 이 아니라 XML 에러로 돌아온다.
    const msg = /<returnAuthMsg>(.*?)<\/returnAuthMsg>/.exec(text)?.[1]
      || /<errMsg>(.*?)<\/errMsg>/.exec(text)?.[1]
      || text.slice(0, 200);
    throw new Error(`${type} 조회 실패: ${msg}`);
  }

  const header = json.response?.header;
  if (header && header.resultCode !== '00') {
    throw new Error(`${type} 조회 실패: ${header.resultMsg} (${header.resultCode})`);
  }

  const body = json.response?.body ?? {};
  const raw = Array.isArray(body.items) ? body.items : (body.items ? [body.items] : []);
  return { rows: raw.map(r => normalize(r, type)), total: Number(body.totalCount) || 0 };
}

async function runFetch(type, bgnDt, endDt) {
  // 1페이지를 먼저 받아 전체 건수를 알아낸 다음, 남은 페이지는 한꺼번에 부른다.
  // 순서대로 기다리면 유형당 10초 넘게 걸린다.
  const first = await fetchPage(type, bgnDt, endDt, 1);
  const pages = Math.min(Math.ceil(first.total / ROWS_PER_PAGE), MAX_PAGES);
  if (pages <= 1) return first.rows;

  const rest = [];
  for (let p = 2; p <= pages; p++) rest.push(fetchPage(type, bgnDt, endDt, p));

  const settled = await Promise.all(rest);
  return first.rows.concat(...settled.map(s => s.rows));
}

/**
 * 최근 N일 사이에 등록된 공고를 유형별로 모아온다.
 * @param {{types?: string[], days?: number, now?: Date}} opts
 */
export async function fetchRecentBids({ types = ALL_TYPES, days = 7, now = new Date(), caller = 'cron' } = {}) {
  const wanted = types.filter(t => OPERATIONS[t]);
  if (!wanted.length) return { bids: [], asOf: now.toISOString(), range: null };

  const end = now;
  const bgn = new Date(now.getTime() - days * 86400000);
  const bgnDt = stamp(bgn), endDt = stamp(end);

  // 유형별 조회는 서로 독립이므로 동시에 보낸다.
  const settled = await Promise.allSettled(
    wanted.map(t => fetchType(t, bgnDt, endDt, `${t}|${days}d`, caller))
  );

  const bids = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') bids.push(...r.value);
    else errors.push(`${wanted[i]}: ${r.reason.message}`);
  });

  // 유형 4개가 모두 실패하면 조용히 빈 결과를 주는 대신 에러를 낸다.
  if (errors.length === wanted.length) {
    const allQuota = settled.every(r => r.reason?.code === 'QUOTA');
    const msg = errors.join(' / ');
    throw allQuota ? new QuotaError(msg) : new Error(msg);
  }

  return {
    bids,
    errors,
    asOf: now.toISOString(),
    range: { from: bgnDt, to: endDt }
  };
}
