// GET /api/status — 어떤 연결이 준비됐는지 알려준다. 값 자체는 절대 내보내지 않는다.
import { loadEnv } from '../lib/env.js';

const KEYS = [
  { key: 'G2B_SERVICE_KEY',    note: 'data.go.kr 입찰공고정보서비스 인증키' },
  { key: 'TELEGRAM_BOT_TOKEN', note: '@BotFather 에서 받은 봇 토큰' },
  { key: 'TELEGRAM_CHAT_ID',   note: '알림을 받을 대화방 ID' },
  { key: 'DATABASE_URL',       note: 'Neon · sent_notices · alert_log · favorites 테이블' }
];

export default async function handler(req, res) {
  loadEnv();

  const rows = KEYS.map(({ key, note }) => ({
    key: key === 'DATABASE_URL' ? 'DATABASE_URL (Neon)' : key,
    ok: Boolean(process.env[key]),
    note
  }));

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    rows,
    search: Boolean(process.env.G2B_SERVICE_KEY),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    database: Boolean(process.env.DATABASE_URL)
  }));
}
