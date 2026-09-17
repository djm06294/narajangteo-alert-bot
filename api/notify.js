// /api/notify — 알림 배치. 공고를 조회해 새 것만 텔레그램으로 보낸다.
//
// 나중에 Vercel Cron 이 정해진 주기로 이 주소를 부른다.
// 쿼리: dry=1 (보내지 않고 결과만) / force=1 (알림 시간대·주말 규칙 무시)
import { fetchRecentBids } from '../lib/g2b.js';
import { applyRules } from '../lib/filter.js';
import { getRules, filterUnsent, markSent, logAlert } from '../lib/store.js';
import { sendMessage, formatBundle, chunkBids, isConfigured } from '../lib/telegram.js';

const PER_MESSAGE = 5;     // 한 통에 담는 공고 수
const MAX_MESSAGES = 4;    // 한 회차에 보내는 최대 통수 (알림 폭탄 방지)

// 서버는 UTC 로 돈다. now.getHours() 를 그대로 쓰면 한국 시간 기준 규칙이 9시간 어긋난다.
const TZ = process.env.ALERT_TIMEZONE || 'Asia/Seoul';

/** 주어진 시각을 TZ 기준의 요일·시·분으로 바꾼다. */
function localParts(now, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit'
  }).formatToParts(now);

  const get = type => parts.find(p => p.type === type)?.value;
  return {
    weekday: get('weekday'),                 // Mon, Tue, ...
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute'))
  };
}

/** 지금이 알림을 보내도 되는 시간인가. 판단은 항상 TZ(기본 서울) 기준이다. */
function withinWindow(rules, now = new Date()) {
  const { weekday, minutes } = localParts(now);

  if (!rules.weekend && (weekday === 'Sat' || weekday === 'Sun')) {
    return { ok: false, why: '주말에는 보내지 않음' };
  }

  const toMin = (hhmm, fallback) => {
    const [h, m] = String(hhmm || fallback).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };

  const start = toMin(rules.quietStart, '00:00');
  const end = toMin(rules.quietEnd, '23:59');
  if (start == null || end == null) return { ok: true };

  if (minutes < start || minutes > end) {
    return { ok: false, why: `알림 시간대(${rules.quietStart}–${rules.quietEnd} ${TZ}) 밖` };
  }
  return { ok: true };
}

/** 크론이 부른 요청인지 확인한다. CRON_SECRET 이 없으면(로컬) 검사하지 않는다. */
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const dry = url.searchParams.get('dry') === '1';
  const force = url.searchParams.get('force') === '1';

  const reply = (code, body) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.statusCode = code;
    res.end(JSON.stringify(body));
  };

  // 이 주소는 텔레그램을 보내고 공고 API 호출 한도를 쓴다. 배포본에서는 크론만 부를 수 있게 막는다.
  if (!authorized(req)) {
    return reply(401, { ok: false, error: '권한이 없습니다 (CRON_SECRET 필요)' });
  }

  const rules = await getRules();

  if (!isConfigured()) {
    return reply(400, { ok: false, error: 'TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 가 없습니다' });
  }

  const window = force ? { ok: true } : withinWindow(rules);
  if (!window.ok) {
    return reply(200, { ok: true, skipped: true, reason: window.why, sent: 0 });
  }

  try {
    const now = new Date();
    const { bids } = await fetchRecentBids({ types: rules.types, days: rules.lookback, now });
    const { items } = applyRules(bids, rules, now);

    let blocked = 0, overPrice = 0, tooFar = 0;
    const candidates = [];

    for (const bid of items) {
      if (bid.blockedBy) { blocked++; continue; }
      if (rules.maxPrice != null && bid.price != null && bid.price > rules.maxPrice) { overPrice++; continue; }
      if (rules.maxDaysLeft != null && bid.daysLeft != null && bid.daysLeft > rules.maxDaysLeft) { tooFar++; continue; }
      candidates.push(bid);
    }

    // 이미 보낸 공고는 건너뛴다. 차수가 오르면 열쇠가 달라져 새 공고로 잡힌다.
    // 한 건씩 묻지 않고 한 번에 거른다. DB 를 쓰면 왕복 수가 그대로 느려짐이 된다.
    const fresh = await filterUnsent(candidates);
    const dup = candidates.length - fresh.length;

    const summary = {
      scanned: bids.length, matched: items.length,
      fresh: fresh.length, dup, blocked, overPrice, tooFar
    };

    if (!fresh.length) {
      await logAlert({ kind: 'run', note: `스캔 ${summary.scanned} · 신규 0 · 중복 ${dup} · 제외 ${blocked}` });
      return reply(200, { ok: true, sent: 0, ...summary });
    }

    // 한 통에 5건씩, 한 회차에 최대 MAX_MESSAGES 통.
    // 넘치는 건은 보내지 않고 기록도 하지 않으므로 다음 회차에 그대로 잡힌다.
    const batch = fresh.slice(0, MAX_MESSAGES * PER_MESSAGE);
    const leftover = fresh.length - batch.length;
    const chunks = chunkBids(batch, PER_MESSAGE);

    if (dry) {
      return reply(200, {
        ok: true, dry: true, sent: 0, ...summary, leftover, messages: chunks.length,
        preview: chunks.map((c, i) =>
          formatBundle(c, rules.fields, { part: i + 1, parts: chunks.length, leftover: i === chunks.length - 1 ? leftover : 0 }))
      });
    }

    let sent = 0;
    for (const [i, chunk] of chunks.entries()) {
      const meta = { part: i + 1, parts: chunks.length, leftover: i === chunks.length - 1 ? leftover : 0 };
      await sendMessage(formatBundle(chunk, rules.fields, meta));

      // 전송에 성공한 뒤에만 기록한다. 실패하면 다음 회차에 다시 시도해야 하기 때문이다.
      for (const bid of chunk) {
        await markSent(bid);
        await logAlert({
          kind: 'sent', no: bid.no, ord: bid.ord, title: bid.title, agency: bid.agency,
          type: bid.type, deadline: bid.deadline, url: bid.url,
          keyword: (bid.matched || [])[0] || '', note: '텔레그램 전송'
        });
        sent++;
      }

      // 같은 대화방에 초당 1통 넘게 보내면 텔레그램이 막는다.
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1200));
    }

    await logAlert({ kind: 'run', note: `스캔 ${summary.scanned} · 전송 ${sent} · 중복 ${dup} · 제외 ${blocked}${leftover ? ` · 다음 회차로 ${leftover}` : ''}` });

    return reply(200, { ok: true, sent, messages: chunks.length, leftover, ...summary });
  } catch (err) {
    await logAlert({ kind: 'error', title: '알림 배치 실패', note: err.message });
    return reply(502, { ok: false, error: err.message });
  }
}
