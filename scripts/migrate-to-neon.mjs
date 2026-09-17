// .data/ 의 JSON 파일을 Neon 으로 옮긴다.
//
//   node scripts/migrate-to-neon.mjs
//
// 여러 번 돌려도 안전하다. 같은 공고는 덮어쓰지 않고 넘어간다.
// 알림 이력은 중복될 수 있으니 한 번만 돌리는 게 좋다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 이 없습니다. vercel env pull 을 먼저 하세요.');
  process.exit(1);
}

const store = await import('../lib/store-neon.js');
await store.ready();

const read = name => {
  const file = path.join(root, '.data', name);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
};

let moved = { sent: 0, alerts: 0, rules: 0 };

// 보낸 공고 — 이게 제일 중요하다. 안 옮기면 전부 다시 보낸다.
const sent = read('sent-notices.json');
if (sent) {
  for (const row of Object.values(sent)) {
    await store.markSent(row);
    moved.sent++;
  }
}

// 알림 이력 — 오래된 것부터 넣어야 순서가 유지된다.
const alerts = read('alert-log.json');
if (alerts) {
  for (const entry of [...alerts].reverse()) {
    await store.logAlert(entry);
    moved.alerts++;
  }
}

// 알림 규칙
const rules = read('rules.json');
if (rules) {
  await store.saveRules(rules);
  moved.rules = 1;
}

console.log(`옮김 — 보낸 공고 ${moved.sent}건 · 알림 이력 ${moved.alerts}건 · 규칙 ${moved.rules ? '있음' : '없음'}`);
console.log(`Neon 의 sent_notices: ${await store.countSent()}건`);
