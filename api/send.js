// POST /api/send — 공고 한 건을 지금 바로 보낸다. 상세 화면의 "지금 보내기" 버튼용.
// 본문: 검색 결과에서 받은 공고 객체 하나.
import { markSent, logAlert, hasSent } from '../lib/store.js';
import { sendMessage, formatBid, isConfigured } from '../lib/telegram.js';
import { getRules } from '../lib/store.js';
import { readJson } from '../lib/http.js';
import { guardAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const reply = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };

  if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST 만 받습니다' });
  // 아무나 부를 수 있으면 남이 내 텔레그램으로 링크를 보낼 수 있다.
  if (!guardAdmin(req, res)) return;
  if (!isConfigured()) return reply(400, { ok: false, error: '텔레그램 토큰이 설정되지 않았습니다' });

  try {
    const body = await readJson(req);

    // 클라이언트가 보낸 것 중 메시지에 쓰는 항목만 추린다.
    const bid = {
      no: String(body.no || ''), ord: String(body.ord || '000'),
      title: String(body.title || ''), agency: String(body.agency || ''),
      type: String(body.type || ''), price: body.price == null ? null : Number(body.price),
      deadline: String(body.deadline || ''), method: String(body.method || ''),
      region: String(body.region || ''), url: String(body.url || ''),
      matched: Array.isArray(body.matched) ? body.matched.map(String) : []
    };
    if (!bid.no || !bid.title) return reply(400, { ok: false, error: '공고번호와 공고명이 필요합니다' });

    const already = await hasSent(bid);
    const rules = await getRules();
    const text = `🔔 새 공고${bid.matched[0] ? ` · ${bid.matched[0]}` : ''}\n\n${formatBid(bid, rules.fields)}`;

    await sendMessage(text);

    await markSent(bid);
    await logAlert({
      kind: 'sent', no: bid.no, ord: bid.ord, title: bid.title, agency: bid.agency,
      type: bid.type, deadline: bid.deadline, url: bid.url,
      keyword: bid.matched[0] || '', note: already ? '수동 재전송' : '수동 전송'
    });

    return reply(200, { ok: true, resent: already });
  } catch (err) {
    await logAlert({ kind: 'error', title: '수동 전송 실패', note: err.message });
    return reply(502, { ok: false, error: err.message });
  }
}
