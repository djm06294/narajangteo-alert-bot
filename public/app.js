/* 나라장터 입찰공고 알림봇 — 화면
 *
 * 공고 조회는 /api/bids 가 한다. 인증키가 브라우저에 내려오면 안 되기 때문이다.
 * 서버가 하는 일: 업무유형별 조회 + 포함/제외 키워드 대조
 * 브라우저가 하는 일: 검색어, 추정가격, 남은 날짜, 정렬 (다시 부르지 않고 즉시 반응)
 */
(() => {
'use strict';

const TYPES = ['공사', '용역', '물품', '외자'];
const INTERVALS = ['하루 1회 (21:00)', '30분마다', '1시간마다', '하루 2회'];
const TG_FIELDS = ['공고번호', '발주기관', '업무유형', '추정가격', '마감일시', '낙찰방법', '지역제한'];
const STORE_KEY = 'njt-alert-bot';

const defaults = () => ({
  tab: 'search',
  q: '',
  keywords: ['태양광', 'ESS', '에너지저장'],
  excludes: ['유지관리', '청소'],
  types: {공사: true, 용역: true, 물품: true, 외자: false},
  lookback: 3,      // 며칠치 공고를 가져올지 (서버 조회 범위)
  maxPrice: 50,
  days: 45,
  sort: 'deadline',
  sel: null,
  interval: '하루 1회 (21:00)',
  weekend: true,
  quietStart: '00:00',
  quietEnd: '23:59',
  kwDraft: '',
  exDraft: '',
  showFiltered: false,
  tgOn: {공고번호: true, 발주기관: true, 업무유형: true, 추정가격: true, 마감일시: true, 낙찰방법: false, 지역제한: false},
  chatLabel: '입찰공고 알림방'
});

let state = load();

// 서버에서 받아오는 것들
let bids = [];
let serverExcluded = 0;
let scanned = 0;
let loading = false;
let loadError = null;
let lastFetched = null;
let partialErrors = [];
let status = {rows: [], search: false, telegram: false, database: false};
let alerts = {items: [], totalSent: 0, store: 'file', loaded: false};
let sending = null;   // 전송 중인 공고 id
let favorites = [];   // 서버(Neon)에 저장된 즐겨찾기
let favIds = new Set();

let toast = '';
let toastTimer = null;
let fetchTimer = null;
let fetchToken = 0;

function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved) return base;
    // 저장본을 그대로 믿지 않고 기본값 위에 덮는다. 스키마가 바뀌어도 깨지지 않는다.
    return Object.assign(base, saved, {
      types: Object.assign({}, base.types, saved.types),
      tgOn: Object.assign({}, base.tgOn, saved.tgOn),
      sel: null, kwDraft: '', exDraft: ''
    });
  } catch { return base; }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 사생활 모드 등 */ }
}

/** 상태를 바꾸고 다시 그린다. refetch 를 부르면 서버 조회까지 예약한다. */
function set(patch, refetch = false) {
  Object.assign(state, patch);
  save();
  if (refetch) scheduleFetch();
  render();
}

/* ---------- 공통 ---------- */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** 억원 단위 숫자 → 사람이 읽는 금액. 값이 없으면 '—'. */
function money(v) {
  if (v == null) return '—';
  if (v >= 1) return v.toFixed(1) + '억원';
  const man = Math.round(v * 10000);
  return man > 0 ? man.toLocaleString() + '만원' : '—';
}

function ddayOf(b) {
  if (b.daysLeft != null) return b.daysLeft;
  if (!b.deadline) return null;
  const end = new Date(b.deadline.replace(' ', 'T') + ':00');
  if (Number.isNaN(end.getTime())) return null;
  return Math.floor((end - Date.now()) / 86400000);
}

const ddayText = d => d == null ? '—' : 'D-' + d;

const fmtStamp = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-` +
  `${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:` +
  `${String(d.getMinutes()).padStart(2, '0')}` : '—';

function showToast(msg) {
  toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = ''; render(); }, 2600);
  render();
}

const selectedTypes = () => TYPES.filter(t => state.types[t]);

// 배포본에서는 배치를 손으로 돌릴 수 없다. /api/notify 는 크론만 부를 수 있게 막혀 있다.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

/* ---------- 서버 호출 ---------- */

function scheduleFetch() {
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(fetchBids, 400);
}

async function fetchBids() {
  clearTimeout(fetchTimer);
  const types = selectedTypes();
  if (!types.length) {
    bids = []; serverExcluded = 0; scanned = 0; loadError = null; loading = false;
    render();
    return;
  }

  const token = ++fetchToken;
  loading = true;
  loadError = null;
  render();

  const params = new URLSearchParams({
    keywords: state.keywords.join(','),
    excludes: state.excludes.join(','),
    types: types.join(','),
    days: String(state.lookback)
  });

  try {
    const res = await fetch(`/api/bids?${params}`);
    const json = await res.json();
    if (token !== fetchToken) return;   // 더 최근 요청이 있으면 버린다

    if (!json.ok) throw new Error(json.error || '조회에 실패했습니다');

    bids = json.items;
    serverExcluded = json.excludedCount;
    scanned = json.scanned;
    partialErrors = json.partialErrors || [];
    lastFetched = new Date(json.asOf);
  } catch (err) {
    if (token !== fetchToken) return;
    loadError = err.message;
    bids = [];
  } finally {
    if (token === fetchToken) {
      loading = false;
      render();
    }
  }
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const json = await res.json();
    if (json.ok) { status = json; render(); }
  } catch { /* 상태 표시는 없어도 그만 */ }
}

/* ---------- 관리자 비밀번호 ---------- */
// 쓰는 요청(전송·규칙·즐겨찾기)은 서버가 비밀번호를 요구할 수 있다.
// 처음 401 을 받으면 물어보고, 맞으면 이 브라우저에 기억해 둔다.

const ADMIN_KEY = 'njt-admin-password';
let pwPrompt = null;   // {resolve, error} — 비밀번호 창이 떠 있을 때
let pwDraft = '';

function getAdminPw() {
  try { return localStorage.getItem(ADMIN_KEY) || ''; } catch { return ''; }
}
function setAdminPw(pw) {
  try { pw ? localStorage.setItem(ADMIN_KEY, pw) : localStorage.removeItem(ADMIN_KEY); } catch { /* 무시 */ }
}

/** 비밀번호 창을 띄우고 입력값(취소하면 null)을 돌려준다. */
function askPassword(error = '') {
  return new Promise(resolve => {
    pwDraft = '';
    pwPrompt = {resolve, error};
    render();
    document.querySelector('[data-focus="adminPw"]')?.focus();
  });
}

function closePassword(value) {
  const p = pwPrompt;
  pwPrompt = null;
  pwDraft = '';
  render();
  if (p) p.resolve(value);
}

/** fetch 와 같지만 관리자 비밀번호를 붙이고, 막히면 물어본 뒤 다시 보낸다. */
async function adminFetch(url, opts = {}) {
  let error = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = Object.assign({}, opts.headers);
    const pw = getAdminPw();
    // 헤더에는 한글을 못 실으므로 인코딩한다. 서버가 되돌린다.
    if (pw) headers['x-admin-password'] = encodeURIComponent(pw);

    const res = await fetch(url, Object.assign({}, opts, {headers}));
    if (res.status !== 401) return res;

    if (pw) { setAdminPw(''); error = '비밀번호가 틀렸습니다'; }
    const entered = await askPassword(error);
    if (!entered) throw new Error('관리자 비밀번호가 필요합니다');
    setAdminPw(entered);
  }
  throw new Error('비밀번호가 맞지 않습니다');
}

function passwordHtml() {
  if (!pwPrompt) return '';
  return `<button type="button" class="scrim" data-act="pw-cancel" aria-label="닫기"></button>
  <div class="pw-dialog" role="dialog" aria-label="관리자 비밀번호">
    <div class="drawer-title">관리자 비밀번호</div>
    <div class="drawer-note" style="color:var(--muted)">
      전송·규칙 변경·즐겨찾기는 관리자만 할 수 있습니다. 한 번 입력하면 이 브라우저가 기억합니다.
    </div>
    <input type="password" class="text-input" data-field="adminPw" data-focus="adminPw"
           autocomplete="current-password" value="${esc(pwDraft)}" placeholder="비밀번호">
    ${pwPrompt.error ? `<div class="tag blocked" style="align-self:flex-start">${esc(pwPrompt.error)}</div>` : ''}
    <div class="drawer-actions">
      <button type="button" class="send" data-act="pw-ok">확인</button>
      <button type="button" class="fav" data-act="pw-cancel">취소</button>
    </div>
  </div>`;
}

function setFavorites(items) {
  favorites = Array.isArray(items) ? items : [];
  favIds = new Set(favorites.map(b => b.id));
}

/**
 * 즐겨찾기를 서버에서 읽어온다.
 * 예전에 브라우저에 저장해 둔 게 있으면 한 번만 서버로 올리고 지운다.
 */
async function fetchFavorites() {
  try {
    const res = await fetch('/api/favorites');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    setFavorites(json.items);

    const legacy = readLegacyFavorites();
    if (legacy.length) {
      const known = new Set(favorites.map(b => b.id));
      const moving = legacy.filter(b => b && b.id && !known.has(b.id));
      if (moving.length) {
        const up = await adminFetch('/api/favorites', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({items: moving})
        });
        const upJson = await up.json();
        if (upJson.ok) {
          setFavorites(upJson.items);
          showToast(`즐겨찾기 ${moving.length}건을 서버로 옮겼습니다`);
        }
      }
      clearLegacyFavorites();
    }
    render();
  } catch (err) {
    showToast(`즐겨찾기를 불러오지 못했습니다: ${err.message}`);
  }
}

/** 예전 버전이 localStorage 에 넣어둔 즐겨찾기. 옮기고 나면 더 안 쓴다. */
function readLegacyFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const favs = saved && saved.favs;
    return favs && typeof favs === 'object' ? Object.values(favs) : [];
  } catch { return []; }
}

function clearLegacyFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.favs) {
      delete saved.favs;
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    }
  } catch { /* 지우기 실패해도 그만 — 중복은 id 로 걸러진다 */ }
}

async function fetchAlerts() {
  try {
    const res = await fetch('/api/alerts?limit=100');
    const json = await res.json();
    if (json.ok) { alerts = {...json, loaded: true}; render(); }
  } catch { alerts = {...alerts, loaded: true}; render(); }
}

/** 지금 이 화면의 설정을 서버에 저장한다. 크론은 localStorage 를 읽을 수 없다. */
async function saveRulesToServer() {
  const res = await adminFetch('/api/rules', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      keywords: state.keywords,
      excludes: state.excludes,
      types: selectedTypes(),
      lookback: state.lookback,
      maxPrice: state.maxPrice >= 50 ? null : state.maxPrice,
      maxDaysLeft: state.days >= 45 ? null : state.days,
      interval: state.interval,
      quietStart: state.quietStart,
      quietEnd: state.quietEnd,
      weekend: state.weekend,
      fields: TG_FIELDS.filter(k => state.tgOn[k])
    })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '저장 실패');
}

/** 공고 한 건을 지금 텔레그램으로 보낸다. */
async function sendOne(bid) {
  sending = bid.id;
  render();
  try {
    const res = await adminFetch('/api/send', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(bid)
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast(json.resent ? '이미 보낸 공고를 다시 보냈습니다' : '텔레그램으로 보냈습니다');
    fetchAlerts();
  } catch (err) {
    showToast(`전송 실패: ${err.message}`);
  } finally {
    sending = null;
    render();
  }
}

/** 알림 배치를 지금 한 번 돌린다. 설정 화면의 "지금 한 번 실행" 버튼. */
async function runNotify({dry}) {
  try {
    await saveRulesToServer();   // 서버 규칙을 화면과 맞춘 뒤 돌린다
    const res = await fetch(`/api/notify?force=1${dry ? '&dry=1' : ''}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    if (json.skipped) return showToast(`건너뜀: ${json.reason}`);
    showToast(dry
      ? `미리보기: 신규 ${json.fresh}건 · 중복 ${json.dup}건 · 제외 ${json.blocked}건`
      : `전송 ${json.sent}건 · 중복 ${json.dup}건 · 제외 ${json.blocked}건`);
    fetchAlerts();
  } catch (err) {
    showToast(`실행 실패: ${err.message}`);
  }
}

/* ---------- 브라우저 쪽 필터 ---------- */

/** 서버가 준 목록에 검색어·가격·남은 날짜를 적용한다. */
function visibleBids() {
  const q = state.q.trim().toLowerCase();
  const out = bids.filter(b => {
    if (b.blockedBy && !state.showFiltered) return false;
    if (q && !`${b.title} ${b.agency} ${b.no}`.toLowerCase().includes(q)) return false;
    // 가격을 모르는 공고는 가격 조건으로 버리지 않는다. 버리면 조용히 사라진다.
    if (b.price != null && state.maxPrice < 50 && b.price > state.maxPrice) return false;
    const d = ddayOf(b);
    if (d != null && d > state.days) return false;
    return true;
  });

  out.sort((x, y) =>
    state.sort === 'price' ? (y.price ?? -1) - (x.price ?? -1)
    : state.sort === 'new' ? (x.postedAt < y.postedAt ? 1 : -1)
    : (ddayOf(x) ?? 9999) - (ddayOf(y) ?? 9999));

  return out;
}

const favList = () => favorites;

/* ---------- 머리말 ---------- */

function headerHtml() {
  const searchOk = status.search;
  const backendOk = status.telegram && status.database;
  return `<header class="header">
    <div class="brand">
      <div class="brand-mark">NJT</div>
      <div class="brand-name">나라장터 입찰공고 알림봇</div>
      <div class="brand-ver">v0.2</div>
    </div>
    <div class="spacer"></div>
    <div class="header-right">
      <div class="pill ${searchOk ? '' : 'off'}">
        <span class="dot ${searchOk ? 'on' : 'idle'}"></span>
        <span>${searchOk ? '공고 API 연결됨' : '공고 API 미연결'}</span>
      </div>
      <div class="pill ${status.telegram ? '' : 'off'}">
        <span class="dot ${status.telegram ? 'on' : 'idle'}"></span>
        <span>${status.telegram ? '텔레그램 연결됨' : '텔레그램 미연결'}</span>
      </div>
      <div class="pill ${status.database ? '' : 'off'}">
        <span class="dot ${status.database ? 'on' : 'idle'}"></span>
        <span>${status.database ? 'DB 연결됨' : 'DB 미연결 · 로컬 파일'}</span>
      </div>
      <div class="next-run">${backendOk ? `확인 주기 ${esc(state.interval)}` : '수동 실행'}</div>
    </div>
  </header>`;
}

function tabsHtml() {
  const defs = [
    ['search', '검색', null],
    ['settings', '설정', null],
    ['alerts', '알림 이력', null],
    ['favs', '즐겨찾기', String(favList().length)],
    ['telegram', '텔레그램', null]
  ];
  return `<nav class="tabs">${defs.map(([key, label, count]) => `
    <button type="button" class="tab ${state.tab === key ? 'active' : ''}" data-act="tab" data-val="${key}">
      <span>${label}</span>
      ${count && count !== '0' ? `<span class="tab-count">${esc(count)}</span>` : ''}
    </button>`).join('')}</nav>`;
}

/* ---------- 검색 탭 ---------- */

function chipHtml(word, kind) {
  const act = kind === 'exclude' ? 'remove-ex' : 'remove-kw';
  return `<div class="chip ${kind === 'exclude' ? 'exclude' : ''}">
    <span>${esc(word)}</span>
    <button type="button" data-act="${act}" data-val="${esc(word)}" aria-label="${esc(word)} 삭제">×</button>
  </div>`;
}

function sidebarHtml() {
  const counts = {};
  TYPES.forEach(t => counts[t] = bids.filter(b => b.type === t).length);

  return `<aside class="sidebar">
    <div class="field">
      <div class="field-label">포함 키워드</div>
      <div class="chips">${state.keywords.map(w => chipHtml(w, 'include')).join('')}</div>
      <input class="text-input" data-field="kwDraft" data-focus="kwDraft"
             value="${esc(state.kwDraft)}" placeholder="키워드 입력 후 Enter">
      ${state.keywords.length ? '' :
        '<div class="hint">키워드가 없으면 기간 내 모든 공고를 가져옵니다</div>'}
    </div>

    <div class="field">
      <div class="field-label">제외 키워드</div>
      <div class="chips">${state.excludes.map(w => chipHtml(w, 'exclude')).join('')}</div>
      <input class="text-input exclude" data-field="exDraft" data-focus="exDraft"
             value="${esc(state.exDraft)}" placeholder="제외어 입력 후 Enter">
    </div>

    <div class="divider"></div>

    <div class="field">
      <div class="field-label">업무유형</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${TYPES.map(t => `
          <label class="check-row">
            <span class="checkbox ${state.types[t] ? 'on' : ''}">${state.types[t] ? '✓' : ''}</span>
            <input type="checkbox" data-act="toggle-type" data-val="${t}" ${state.types[t] ? 'checked' : ''}>
            <span class="label">${t}</span>
            <span class="spacer"></span>
            <span class="count">${state.types[t] ? counts[t] : '–'}</span>
          </label>`).join('')}
      </div>
    </div>

    <div class="field">
      <div class="slider-head">
        <div class="field-label">조회 기간</div>
        <div class="slider-value">최근 ${state.lookback}일</div>
      </div>
      <input type="range" min="1" max="30" step="1" value="${state.lookback}" data-field="lookback">
      <div class="slider-scale"><span>1일</span><span>30일</span></div>
    </div>

    <div class="divider"></div>

    <div class="field">
      <div class="slider-head">
        <div class="field-label">추정가격 상한</div>
        <div class="slider-value">${state.maxPrice >= 50 ? '제한 없음' : state.maxPrice + '억'}</div>
      </div>
      <input type="range" min="1" max="50" step="1" value="${state.maxPrice}" data-field="maxPrice">
      <div class="slider-scale"><span>1억</span><span>제한 없음</span></div>
    </div>

    <div class="field">
      <div class="slider-head">
        <div class="field-label">마감까지 남은 날짜</div>
        <div class="slider-value">D-${state.days} 이내</div>
      </div>
      <input type="range" min="1" max="45" step="1" value="${state.days}" data-field="days">
    </div>

    <div class="divider"></div>
    <button type="button" class="btn" data-act="reset">필터 초기화</button>
  </aside>`;
}

function rowHtml(b) {
  const dday = ddayOf(b);
  const urgent = dday != null && dday <= 3;
  const soon = dday != null && dday <= 7;
  const dotColor = urgent ? 'var(--urgent)' : soon ? 'var(--warn)' : 'var(--ok)';
  const fav = favIds.has(b.id);
  return `<div class="row ${state.sel === b.id ? 'selected' : ''} ${b.blockedBy ? 'blocked' : ''}"
       role="button" tabindex="0" data-act="open-row" data-id="${esc(b.id)}">
    <div class="row-dday ${urgent ? 'urgent' : ''}">
      <span class="dot" style="background:${dotColor}"></span>
      <span>${ddayText(dday)}</span>
    </div>
    <div class="row-main">
      <div class="row-title">${esc(b.title)}</div>
      <div class="row-sub">
        <span class="row-agency">${esc(b.agency)}</span>
        <span class="row-no">${esc(b.no)}</span>
        ${(b.matched || []).map(m => `<span class="tag">${esc(m)}</span>`).join('')}
        ${b.kind && b.kind !== '등록공고' ? `<span class="tag">${esc(b.kind)}</span>` : ''}
        ${b.blockedBy ? `<span class="tag blocked">제외어: ${esc(b.blockedBy)}</span>` : ''}
      </div>
    </div>
    <div class="col-rest">
      <div class="row-type">${b.type}</div>
      <div class="row-price">${money(b.price)}</div>
      <div class="row-deadline">${esc(b.deadline || '—')}</div>
      <div class="row-actions">
        <button type="button" class="icon-btn ${fav ? 'on' : ''}" data-act="fav" data-id="${esc(b.id)}"
                title="즐겨찾기" aria-pressed="${fav}">★</button>
        ${b.url ? `<a href="${esc(b.url)}" class="icon-link" target="_blank" rel="noopener"
                      data-act="stop" title="나라장터 원문">↗</a>` : '<span class="icon-link">·</span>'}
      </div>
    </div>
  </div>`;
}

function tableBodyHtml(rows) {
  if (loading) {
    return `<div class="empty">
      <div class="empty-title">나라장터에서 공고를 가져오는 중…</div>
      <div class="empty-hint">
        최근 ${state.lookback}일 · ${selectedTypes().join(' · ') || '선택된 유형 없음'}<br>
        기간 내 공고를 전부 훑어야 해서 처음에는 10~30초 걸립니다. 이후 10분간은 바로 나옵니다.
      </div>
    </div>`;
  }
  if (loadError) {
    return `<div class="empty">
      <div class="empty-title">공고를 가져오지 못했습니다</div>
      <div class="empty-hint">${esc(loadError)}</div>
      <button type="button" class="btn" style="margin-top:8px" data-act="run-search">다시 시도</button>
    </div>`;
  }
  if (!rows.length) {
    return `<div class="empty">
      <div class="empty-title">조건에 맞는 공고가 없습니다</div>
      <div class="empty-hint">키워드를 줄이거나 조회 기간·남은 날짜 범위를 넓혀보세요</div>
    </div>`;
  }
  return rows.map(rowHtml).join('');
}

function searchHtml() {
  const rows = visibleBids();
  return `<div class="search-layout">
    ${sidebarHtml()}
    <main class="main">
      <div class="searchbar">
        <div class="searchbox">
          <span class="icon">⌕</span>
          <input data-field="q" data-focus="q" value="${esc(state.q)}"
                 placeholder="가져온 결과 안에서 공고명 · 발주기관 · 공고번호 찾기">
          ${state.q ? '<button type="button" class="clear-btn" data-act="clear-q">지우기</button>' : ''}
        </div>
        <select class="select" data-field="sort">
          <option value="deadline" ${state.sort === 'deadline' ? 'selected' : ''}>마감 임박순</option>
          <option value="new" ${state.sort === 'new' ? 'selected' : ''}>공고일 최신순</option>
          <option value="price" ${state.sort === 'price' ? 'selected' : ''}>추정가격 높은순</option>
        </select>
        <button type="button" class="btn-primary" data-act="run-search" ${loading ? 'disabled' : ''}>
          ${loading ? '조회 중…' : '다시 조회'}
        </button>
      </div>

      <div class="result-meta">
        <div class="result-count">검색 결과 <b>${rows.length}</b>건</div>
        ${serverExcluded > 0 ? `
          <div class="excluded-note">
            제외어로 ${serverExcluded}건 걸러짐
            <button type="button" data-act="toggle-filtered">${state.showFiltered ? '숨기기' : '보기'}</button>
          </div>` : ''}
        ${partialErrors.length ? `
          <div class="excluded-note">일부 유형 조회 실패: ${esc(partialErrors.join(', '))}</div>` : ''}
        <div class="spacer"></div>
        <div class="result-asof">
          조회 기준 ${fmtStamp(lastFetched)} · 최근 ${state.lookback}일 등록분 ${scanned.toLocaleString()}건 스캔
        </div>
      </div>

      <div class="card table">
        <div class="thead">
          <div class="th col-dday">마감</div>
          <div class="th col-title">공고명 · 발주기관</div>
          <div class="col-rest">
            <div class="th col-type">유형</div>
            <div class="th col-price">추정가격</div>
            <div class="th col-deadline">마감일시</div>
            <div class="th col-save">저장</div>
          </div>
        </div>
        ${tableBodyHtml(rows)}
      </div>

      <div class="result-foot">
        <div class="note">
          키워드·제외어·업무유형·조회 기간을 바꾸면 나라장터를 다시 조회합니다.
          검색어·가격·남은 날짜는 가져온 결과 안에서 바로 걸러냅니다.
        </div>
      </div>
    </main>
    ${drawerHtml()}
  </div>`;
}

function drawerHtml() {
  const b = bids.find(x => x.id === state.sel) || favorites.find(x => x.id === state.sel);
  if (!b) return '';
  const dday = ddayOf(b);
  const fav = favIds.has(b.id);
  const fields = [
    ['공고번호', `${b.no} (${b.ord}차)`],
    ['공고종류', b.kind || '—'],
    ['발주기관', b.agency],
    ['수요기관', b.demandAgency || b.agency],
    ['업무유형', b.type],
    [b.priceSource || '추정가격', money(b.price)],
    ['공고일시', b.postedAt || '—'],
    ['입찰마감', b.deadline || '—'],
    ['개찰일시', b.opensAt || '—'],
    ['계약방법', b.method],
    ['공동계약 의무지역', b.region],
    ['매칭 키워드', (b.matched || []).join(', ') || '—']
  ];
  return `<button type="button" class="scrim" data-act="close-sel" aria-label="닫기"></button>
  <aside class="drawer" role="dialog" aria-label="공고 상세">
    <div class="drawer-head">
      <div class="drawer-title">${esc(b.title)}</div>
      <button type="button" class="drawer-close" data-act="close-sel" aria-label="닫기">×</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="dday-badge ${dday != null && dday <= 3 ? 'urgent' : ''}">${ddayText(dday)}</span>
      <span style="font:400 11.5px var(--sans);color:var(--muted)">${esc(b.deadline || '마감일시 없음')} 마감</span>
    </div>
    <div class="kv-list">
      ${fields.map(([k, v]) => `<div class="kv"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('')}
    </div>
    <div class="drawer-actions">
      <button type="button" class="send" data-act="send-now" data-id="${esc(b.id)}"
              ${status.telegram && sending !== b.id ? '' : 'disabled'}>
        ${sending === b.id ? '보내는 중…' : status.telegram ? '텔레그램으로 지금 보내기' : '텔레그램 미연결'}
      </button>
      <button type="button" class="fav" data-act="fav" data-id="${esc(b.id)}">★ ${fav ? '해제' : '담기'}</button>
    </div>
    ${b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener" data-act="stop"
                  style="font:500 12px var(--sans)">나라장터에서 공고 원문 보기 ↗</a>` : ''}
    <div class="drawer-note">보낸 공고는 기록되어 배치에서 다시 보내지 않습니다.</div>
  </aside>`;
}

/* ---------- 설정 탭 ---------- */

function settingsHtml() {
  const rows = status.rows.length ? status.rows : [{key: '확인 중…', ok: false, note: ''}];
  return `<main class="page"><div class="page-inner narrow">

    <section class="card panel">
      <div class="panel-title">확인 주기</div>
      <div class="option-row">
        ${INTERVALS.map(label => `
          <button type="button" class="option ${state.interval === label ? 'on' : ''}"
                  data-act="pick-interval" data-val="${label}">${label}</button>`).join('')}
      </div>
      <div class="grid-2">
        <div class="field">
          <div class="sub-label">알림 시간대</div>
          <div class="time-row">
            <input class="time-input" data-field="quietStart" data-focus="quietStart" value="${esc(state.quietStart)}">
            <span style="color:var(--muted-3)">–</span>
            <input class="time-input" data-field="quietEnd" data-focus="quietEnd" value="${esc(state.quietEnd)}">
          </div>
        </div>
        <div class="field">
          <div class="sub-label">주말 알림</div>
          <button type="button" class="toggle-btn" data-act="toggle-weekend" aria-pressed="${state.weekend}">
            <span>${state.weekend ? '주말에도 보냄' : '평일만'}</span>
            <span class="track ${state.weekend ? 'on' : ''}"><span class="knob"></span></span>
          </button>
        </div>
      </div>
      <div class="callout">
        <b>실제 발송 시각은 Vercel Cron 이 정합니다 — 매일 저녁 9시(한국시간).</b>
        바꾸려면 <span class="mono">vercel.json</span> 의 <span class="mono">crons.schedule</span> 을 고쳐 다시 배포해야 합니다.
        아래 주기·시간대·주말 설정은 그 시각에 보낼지 말지를 한 번 더 거르는 안전장치입니다.
        보낸 공고번호는 기록해 두고 같은 공고를 다시 보내지 않습니다. 재공고(차수 변경)는 새 공고로 봅니다.
      </div>
    </section>

    <section class="card panel">
      <div class="panel-title">키워드 규칙</div>
      <div class="grid-2 wide-gap">
        <div class="field">
          <div class="sub-label">포함 키워드 · 하나라도 맞으면 알림</div>
          <div class="chips">${state.keywords.map(w => chipHtml(w, 'include')).join('')}</div>
          <input class="text-input" data-field="kwDraft" data-focus="kwDraft"
                 value="${esc(state.kwDraft)}" placeholder="키워드 추가">
        </div>
        <div class="field">
          <div class="sub-label">제외 키워드 · 하나라도 맞으면 버림</div>
          <div class="chips">${state.excludes.map(w => chipHtml(w, 'exclude')).join('')}</div>
          <input class="text-input exclude" data-field="exDraft" data-focus="exDraft"
                 value="${esc(state.exDraft)}" placeholder="제외어 추가">
        </div>
      </div>
      <div class="callout">
        공고명과 발주기관·수요기관을 함께 찾습니다. 공백과 대소문자는 무시하므로
        <span class="mono">ESS</span> 와 <span class="mono">ess</span> 는 같게 봅니다.
      </div>
    </section>

    <section class="card panel">
      <div class="page-head">
        <div class="panel-title">연결 상태</div>
        <div class="panel-sub">서버의 .env 에서 읽습니다. 값 자체는 브라우저로 내려오지 않습니다.</div>
      </div>
      <div>
        ${rows.map(e => `
          <div class="env-row">
            <div class="env-key">${esc(e.key)}</div>
            <div class="env-status ${e.ok ? 'ok' : ''}">
              <span class="dot ${e.ok ? 'on' : 'idle'}"></span>${e.ok ? '읽음' : '미설정'}
            </div>
            <div class="env-note">${esc(e.note)}</div>
          </div>`).join('')}
      </div>
    </section>

    <div class="page-actions">
      ${isLocal ? `
        <button type="button" class="ghost" data-act="notify-dry" ${status.telegram ? '' : 'disabled'}>
          보낼 것만 확인 (전송 안 함)
        </button>
        <button type="button" class="ghost" data-act="notify-run" ${status.telegram ? '' : 'disabled'}>
          지금 한 번 실행
        </button>` : ''}
      <button type="button" class="save" data-act="save-settings">설정 저장</button>
    </div>
    ${status.adminRequired ? `<div class="page-foot">
      전송·규칙 변경·즐겨찾기는 관리자 비밀번호가 필요합니다.
      ${getAdminPw() ? '이 브라우저에 저장됨 · <a href="#" data-act="admin-forget">지우기</a>' : '아직 입력하지 않았습니다.'}
    </div>` : ''}
    ${isLocal ? '' : `<div class="page-foot">
      배포본에서는 배치를 손으로 돌릴 수 없습니다.
      <span class="mono">/api/notify</span> 는 <span class="mono">CRON_SECRET</span> 을 아는 크론만 부를 수 있게 막아뒀습니다.
    </div>`}
    <div class="page-foot">
      "설정 저장" 은 이 브라우저와 서버 양쪽에 저장합니다.
      크론은 브라우저 저장소를 읽을 수 없어서, 자동 실행에 쓸 규칙은 서버에도 있어야 합니다.
    </div>
  </div></main>`;
}

/* ---------- 알림 이력 탭 ---------- */

function alertsHtml() {
  const BADGE = {
    sent: ['전송', 'sent'], dup: ['중복', ''], blocked: ['제외', 'blocked'],
    error: ['오류', 'error'], run: ['실행', '']
  };

  // 날짜별로 묶는다.
  const groups = [];
  for (const a of alerts.items) {
    const at = new Date(a.at);
    const day = fmtStamp(at).slice(0, 10);
    const time = fmtStamp(at).slice(11);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push({...a, time});
    else groups.push({day, items: [{...a, time}]});
  }

  const today = fmtStamp(new Date()).slice(0, 10);

  return `<main class="page"><div class="page-inner wide">
    <div class="page-head">
      <div class="page-title">최근 알림</div>
      <div class="page-meta">
        누적 전송 ${alerts.totalSent}건 · 저장 위치 ${alerts.store === 'file' ? '로컬 파일 (.data/)' : alerts.store}
      </div>
    </div>

    ${groups.length ? groups.map(g => `
      <div class="alert-group">
        <div class="alert-day">${esc(g.day)}${g.day === today ? ' (오늘)' : ''}</div>
        <div class="card">
          ${g.items.map(a => {
            const [label, cls] = BADGE[a.kind] || ['기타', ''];
            return `<div class="alert-row">
              <div class="alert-time">${esc(a.time)}</div>
              <div><span class="badge ${cls}">${label}</span></div>
              <div class="alert-main">
                <div class="alert-title">${esc(a.title || (a.kind === 'run' ? '조회 실행' : '—'))}</div>
                <div class="alert-sub">
                  ${a.agency ? `<span class="row-agency">${esc(a.agency)}</span>` : ''}
                  ${a.keyword ? `<span class="tag">${esc(a.keyword)}</span>` : ''}
                  ${a.no ? `<span class="row-no">${esc(a.no)}</span>` : ''}
                </div>
              </div>
              <div class="alert-note">${esc(a.note || '')}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('')
    : `<div class="empty-box">
        ${alerts.loaded ? '아직 보낸 알림이 없습니다.' : '불러오는 중…'}<br>
        <span style="color:var(--muted-3)">설정 탭에서 "지금 한 번 실행"을 눌러보세요.</span>
      </div>`}

    <div class="page-foot">
      지금은 이력이 서버의 <span class="mono">.data/alert-log.json</span> 에 쌓입니다.
      Vercel 에 올리면 파일이 남지 않으므로, 배포 전에 Neon 의 <span class="mono">alert_log</span> 테이블로 옮겨야 합니다.
    </div>
  </div></main>`;
}

/* ---------- 즐겨찾기 탭 ---------- */

function favsHtml() {
  const rows = favList();
  return `<main class="page"><div class="page-inner wide">
    <div class="page-head">
      <div class="page-title">즐겨찾기</div>
      <div class="page-meta">${rows.length}건 저장됨 · ${status.database ? 'Neon 에 저장' : '서버 파일에 저장'}</div>
    </div>
    ${rows.length ? `<div class="fav-grid">${rows.map(b => {
      const dday = ddayOf(b);
      return `<div class="card fav-card">
        <div class="fav-head">
          <div class="fav-title">${esc(b.title)}</div>
          <button type="button" class="icon-btn on" data-act="fav" data-id="${esc(b.id)}" title="즐겨찾기 해제">★</button>
        </div>
        <div class="fav-agency">${esc(b.agency)}</div>
        <div class="fav-meta">
          <span class="dday-badge ${dday != null && dday <= 3 ? 'urgent' : ''}">${ddayText(dday)}</span>
          <span class="price">${money(b.price)}</span>
          <span class="type">${b.type}</span>
        </div>
        <div class="divider soft"></div>
        <div class="fav-foot">
          <span class="no">${esc(b.no)}</span>
          ${b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener" data-act="stop">원문 보기 ↗</a>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`
    : '<div class="empty-box">검색 결과에서 ★ 를 눌러 담아두세요</div>'}
  </div></main>`;
}

/* ---------- 텔레그램 탭 ---------- */

function telegramHtml() {
  const lineFor = b => [
    ['공고번호', b.no], ['발주기관', b.agency], ['업무유형', b.type],
    ['추정가격', money(b.price)], ['마감일시', `${b.deadline || '—'} (${ddayText(ddayOf(b))})`],
    ['낙찰방법', b.method], ['지역제한', b.region]
  ].filter(([k]) => state.tgOn[k]);

  const preview = visibleBids().filter(b => !b.blockedBy).slice(0, 2);

  return `<main class="page"><div class="tg-layout">
    <div class="tg-col">
      <div class="page-title">텔레그램 메시지 미리보기</div>
      <div class="tg-thread">
        ${preview.length ? preview.map(b => `
          <div class="tg-bubble">
            <div class="tg-title">🔔 새 공고 · ${esc((b.matched || [])[0] || state.keywords[0] || '키워드')}\n${esc(b.title)}</div>
            <div class="tg-lines">
              ${lineFor(b).map(([k, v]) => `
                <div class="tg-line"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}
            </div>
            <div class="tg-foot">
              ${b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener" data-act="stop">공고 원문</a>` : ''}
              <span class="spacer"></span>
              <span class="time">미전송</span>
            </div>
          </div>`).join('')
        : '<div class="tg-chat">검색 결과가 있으면 실제 공고로 미리보기를 만듭니다.</div>'}
        <div class="tg-chat">봇 → ${status.telegram ? esc(state.chatLabel) : `${esc(state.chatLabel)} (아직 연결 안 됨)`}</div>
      </div>
    </div>
    <div class="card tg-side">
      <div class="tg-side-title">메시지에 포함할 항목</div>
      ${TG_FIELDS.map(k => `
        <button type="button" class="tg-toggle" data-act="toggle-tg" data-val="${k}" aria-pressed="${!!state.tgOn[k]}">
          <span class="checkbox ${state.tgOn[k] ? 'on' : ''}">${state.tgOn[k] ? '✓' : ''}</span>
          <span class="label">${k}</span>
        </button>`).join('')}
      <div class="divider soft"></div>
      <div class="tg-note">한 번에 여러 공고가 잡히면 5건까지 한 메시지로 묶고, 나머지는 "외 n건"으로 표시합니다.</div>
    </div>
  </div></main>`;
}

/* ---------- 렌더 ---------- */

function bodyHtml() {
  switch (state.tab) {
    case 'settings': return settingsHtml();
    case 'alerts': return alertsHtml();
    case 'favs': return favsHtml();
    case 'telegram': return telegramHtml();
    default: return searchHtml();
  }
}

function render() {
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.focus : null;
  const caret = focusKey && active.selectionStart != null ? active.selectionStart : null;

  document.getElementById('app').innerHTML =
    `<div class="shell">${headerHtml()}${tabsHtml()}${bodyHtml()}</div>` + passwordHtml() +
    (toast ? `<div class="toast" role="status">${esc(toast)}</div>` : '');

  if (focusKey) {
    const next = document.querySelector(`[data-focus="${focusKey}"]`);
    if (next) {
      next.focus();
      if (caret != null && next.setSelectionRange) {
        try { next.setSelectionRange(caret, caret); } catch { /* range 등은 지원 안 함 */ }
      }
    }
  }
}

/* ---------- 이벤트 ---------- */

function addWord(field, draftField) {
  const w = state[draftField].trim();
  if (!w) return;
  if (state[field].includes(w)) return set({[draftField]: ''});
  set({[field]: state[field].concat([w]), [draftField]: ''}, true);
}

async function toggleFav(id) {
  const adding = !favIds.has(id);
  // 검색 범위에서 빠져도 남도록 공고 전체를 저장한다.
  const bid = bids.find(x => x.id === id) || favorites.find(x => x.id === id);
  if (adding && !bid) return;

  // 누르자마자 반응하도록 화면을 먼저 바꾸고, 실패하면 되돌린다.
  const before = favorites;
  favorites = adding ? favorites.concat([bid]) : favorites.filter(x => x.id !== id);
  favIds = new Set(favorites.map(x => x.id));
  render();

  try {
    const res = adding
      ? await adminFetch('/api/favorites', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(bid)
        })
      : await adminFetch(`/api/favorites?id=${encodeURIComponent(id)}`, {method: 'DELETE'});

    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    setFavorites(json.items);
  } catch (err) {
    favorites = before;
    favIds = new Set(favorites.map(x => x.id));
    showToast(`즐겨찾기 저장 실패: ${err.message}`);
  }
  render();
}

const app = document.getElementById('app');

app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const {act, val, id} = el.dataset;

  // 새 탭으로 여는 링크는 그대로 두고, 행 클릭만 막는다.
  if (act === 'stop') { e.stopPropagation(); return; }

  switch (act) {
    case 'tab':
      set({tab: val, sel: null});
      if (val === 'alerts') fetchAlerts();
      break;
    case 'remove-kw': set({keywords: state.keywords.filter(w => w !== val)}, true); break;
    case 'remove-ex': set({excludes: state.excludes.filter(w => w !== val)}, true); break;
    case 'toggle-type': set({types: Object.assign({}, state.types, {[val]: !state.types[val]})}, true); break;
    case 'reset':
      set({q: '', keywords: [], excludes: [], types: {공사: true, 용역: true, 물품: true, 외자: true},
           maxPrice: 50, days: 45, lookback: 3, showFiltered: false}, true);
      break;
    case 'clear-q': set({q: ''}); break;
    case 'run-search': fetchBids(); break;
    case 'toggle-filtered': set({showFiltered: !state.showFiltered}); break;
    case 'open-row': set({sel: state.sel === id ? null : id}); break;
    case 'close-sel': set({sel: null}); break;
    case 'fav': e.stopPropagation(); toggleFav(id); break;
    case 'pick-interval': set({interval: val}); break;
    case 'toggle-weekend': set({weekend: !state.weekend}); break;
    case 'toggle-tg': set({tgOn: Object.assign({}, state.tgOn, {[val]: !state.tgOn[val]})}); break;
    case 'send-now': {
      const bid = bids.find(x => x.id === id) || favorites.find(x => x.id === id);
      if (bid) sendOne(bid);
      break;
    }
    case 'pw-ok': closePassword(pwDraft.trim() || null); break;
    case 'pw-cancel': closePassword(null); break;
    case 'admin-forget': setAdminPw(''); showToast('이 브라우저에서 관리자 비밀번호를 지웠습니다'); break;
    case 'notify-dry': runNotify({dry: true}); break;
    case 'notify-run': runNotify({dry: false}); break;
    case 'save-settings':
      save();
      saveRulesToServer()
        .then(() => showToast('설정을 저장했습니다 (브라우저 + 서버)'))
        .catch(err => showToast(`서버 저장 실패: ${err.message}`));
      break;
  }
});

app.addEventListener('input', e => {
  const field = e.target.dataset.field;
  if (!field) return;
  if (field === 'adminPw') { pwDraft = e.target.value; return; }
  const numeric = field === 'maxPrice' || field === 'days' || field === 'lookback';
  set({[field]: numeric ? Number(e.target.value) : e.target.value}, field === 'lookback');
});

app.addEventListener('change', e => {
  if (e.target.dataset.field === 'sort') set({sort: e.target.value});
});

app.addEventListener('keydown', e => {
  const field = e.target.dataset.field;
  if (e.key === 'Enter' && field === 'kwDraft') addWord('keywords', 'kwDraft');
  if (e.key === 'Enter' && field === 'exDraft') addWord('excludes', 'exDraft');
  if (field === 'adminPw' && e.key === 'Enter') { closePassword(pwDraft.trim() || null); return; }
  if (e.key === 'Escape' && pwPrompt) { closePassword(null); return; }
  if (e.key === 'Escape' && state.sel) set({sel: null});
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.act === 'open-row') {
    e.preventDefault();
    set({sel: state.sel === e.target.dataset.id ? null : e.target.dataset.id});
  }
});

render();
fetchStatus();
fetchFavorites();
fetchBids();
})();
