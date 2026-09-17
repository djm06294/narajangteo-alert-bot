// 공고 매칭 규칙. 검색 화면과 (나중에 붙일) 알림 배치가 같은 함수를 쓴다.

/** 문자열 비교용 정규화: 공백 제거 + 소문자. "ESS" 와 "ess" 를 같게 본다. */
const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();

/**
 * 공고 한 건이 키워드 규칙에 맞는지 본다.
 * @returns {{matched: string[], blockedBy: string|null}|null} 안 맞으면 null
 */
export function matchBid(bid, { keywords = [], excludes = [] } = {}) {
  // 공고명 + 발주기관 + 수요기관을 한 덩어리로 보고 찾는다.
  const hay = norm(`${bid.title} ${bid.agency} ${bid.demandAgency}`);

  const matched = keywords.filter(k => k && hay.includes(norm(k)));
  // 포함 키워드가 하나라도 있으면, 그중 하나는 맞아야 한다.
  if (keywords.length && !matched.length) return null;

  // 제외어는 버리지 않고 표시만 한다. 화면에서 "걸러진 n건 보기" 로 확인할 수 있다.
  const blockedBy = excludes.find(k => k && hay.includes(norm(k))) || null;

  return { matched, blockedBy };
}

/** 마감까지 남은 일수. 마감이 지났으면 음수. 마감일시가 없으면 null. */
export function daysLeft(bid, now = new Date()) {
  if (!bid.deadline) return null;
  const end = new Date(bid.deadline.replace(' ', 'T') + ':00');
  if (Number.isNaN(end.getTime())) return null;
  return Math.floor((end - now) / 86400000);
}

/**
 * 목록 전체에 키워드 규칙을 적용한다.
 * @returns {{items: Array, excludedCount: number}} items 각 원소에 matched/blockedBy 가 붙는다.
 */
export function applyRules(bids, rules, now = new Date()) {
  const items = [];
  let excludedCount = 0;

  for (const bid of bids) {
    const info = matchBid(bid, rules);
    if (!info) continue;

    // 이미 마감된 공고는 알릴 이유가 없다.
    const left = daysLeft(bid, now);
    if (left !== null && left < 0) continue;

    if (info.blockedBy) excludedCount++;
    items.push({ ...bid, matched: info.matched, blockedBy: info.blockedBy, daysLeft: left });
  }

  return { items, excludedCount };
}
