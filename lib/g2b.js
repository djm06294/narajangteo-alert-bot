// 조달청 나라장터 입찰공고정보서비스 클라이언트.
// 참고문서: 조달청_OpenAPI참고자료_나라장터_입찰공고정보서비스_1.2.docx
import { requireEnv } from './env.js';

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
async function fetchType(type, bgnDt, endDt, cacheKey) {
  const key = cacheKey || `${type}|${bgnDt}|${endDt}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  // 같은 조건의 조회가 이미 날아가 있으면 그 약속을 같이 기다린다.
  const pending = inflight.get(key);
  if (pending) return pending;

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
export async function fetchRecentBids({ types = ALL_TYPES, days = 7, now = new Date() } = {}) {
  const wanted = types.filter(t => OPERATIONS[t]);
  if (!wanted.length) return { bids: [], asOf: now.toISOString(), range: null };

  const end = now;
  const bgn = new Date(now.getTime() - days * 86400000);
  const bgnDt = stamp(bgn), endDt = stamp(end);

  // 유형별 조회는 서로 독립이므로 동시에 보낸다.
  const settled = await Promise.allSettled(
    wanted.map(t => fetchType(t, bgnDt, endDt, `${t}|${days}d`))
  );

  const bids = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') bids.push(...r.value);
    else errors.push(`${wanted[i]}: ${r.reason.message}`);
  });

  // 유형 4개가 모두 실패하면 조용히 빈 결과를 주는 대신 에러를 낸다.
  if (errors.length === wanted.length) throw new Error(errors.join(' / '));

  return {
    bids,
    errors,
    asOf: now.toISOString(),
    range: { from: bgnDt, to: endDt }
  };
}
