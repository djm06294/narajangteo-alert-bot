// 텔레그램 봇으로 메시지를 보낸다. https://core.telegram.org/bots/api#sendmessage
import { requireEnv, loadEnv } from './env.js';

const API = 'https://api.telegram.org';
const MAX_LEN = 4096;          // 텔레그램 한 메시지 길이 제한
const BUNDLE = 5;              // 한 메시지에 묶을 공고 수

/** HTML 파스 모드에서 쓸 수 있게 막는다. */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function isConfigured() {
  loadEnv();
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

const money = v => v == null ? '—'
  : v >= 1 ? v.toFixed(1) + '억원'
  : Math.round(v * 10000).toLocaleString() + '만원';

function daysLeft(bid) {
  if (!bid.deadline) return null;
  const end = new Date(bid.deadline.replace(' ', 'T') + ':00');
  return Number.isNaN(end.getTime()) ? null : Math.floor((end - Date.now()) / 86400000);
}

/** 공고 한 건을 메시지 한 덩어리로. fields 로 넣을 항목을 고른다. */
export function formatBid(bid, fields = ['공고번호', '발주기관', '업무유형', '추정가격', '마감일시']) {
  const d = daysLeft(bid);
  const all = {
    공고번호: `${bid.no} (${bid.ord}차)`,
    발주기관: bid.agency,
    업무유형: bid.type,
    추정가격: money(bid.price),
    마감일시: bid.deadline ? `${bid.deadline}${d == null ? '' : ` (D-${d})`}` : '—',
    낙찰방법: bid.method,
    지역제한: bid.region
  };

  const lines = fields
    .filter(k => all[k])
    .map(k => `${k}  ${esc(all[k])}`);

  const head = `<b>${esc(bid.title)}</b>`;
  const link = bid.url ? `\n<a href="${esc(bid.url)}">공고 원문 보기</a>` : '';
  return `${head}\n${lines.join('\n')}${link}`;
}

/** 공고 목록을 한 메시지에 담을 만큼씩 자른다. 기본 5건. */
export function chunkBids(bids, size = BUNDLE) {
  const out = [];
  for (let i = 0; i < bids.length; i += size) out.push(bids.slice(i, i + size));
  return out;
}

/**
 * 공고 묶음 하나를 메시지 한 통으로.
 * @param {object} meta {part, parts, leftover} — 여러 통으로 나뉠 때 표시용
 */
export function formatBundle(bids, fields, meta = {}) {
  const { part, parts, leftover = 0 } = meta;
  const keyword = bids[0]?.matched?.[0];

  const count = parts > 1 ? `${part}/${parts}` : `${bids.length}건`;
  const header = `🔔 새 공고 ${count}${keyword ? ` · ${esc(keyword)}` : ''}`;
  const body = bids.map(b => formatBid(b, fields)).join('\n\n');
  // 남은 건은 다음 회차에 보낸다. 안 보낸 것을 보낸 척하지 않는다.
  const tail = leftover > 0 ? `\n\n남은 ${leftover}건은 다음 회차에 보냅니다.` : '';

  return `${header}\n\n${body}${tail}`.slice(0, MAX_LEN);
}

/** 실제 전송. 실패하면 텔레그램이 준 설명을 그대로 담아 던진다. */
export async function sendMessage(text, { chatId } = {}) {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  const to = chatId || requireEnv('TELEGRAM_CHAT_ID');

  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: to,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    throw new Error(`텔레그램 전송 실패: ${json.description || `HTTP ${res.status}`}`);
  }
  return json.result;
}

/** 토큰이 살아 있는지만 본다. 메시지는 보내지 않는다. */
export async function getMe() {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  const res = await fetch(`${API}/bot${token}/getMe`);
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(json.description || `HTTP ${res.status}`);
  return json.result;
}
