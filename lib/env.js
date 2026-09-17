// .env 를 읽어 process.env 에 넣는다. 의존성 없이 동작하도록 직접 파싱한다.
// Vercel 에서는 환경변수가 이미 주입되어 있으므로 파일이 없어도 그냥 넘어간다.
import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

export function loadEnv(dir = process.cwd()) {
  if (loaded) return;
  loaded = true;

  // .env.local 을 먼저 읽는다. 이미 들어있는 값은 덮지 않으므로 이쪽이 이긴다.
  // vercel env pull 이 .env.local 에 쓰기 때문이다.
  for (const name of ['.env.local', '.env']) readFile(path.join(dir, name));
}

function readFile(file) {
  if (!fs.existsSync(file)) return;

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // 따옴표로 감싼 값은 벗겨낸다.
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // 이미 들어있는 값(Vercel 등)을 덮어쓰지 않는다.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** 값이 없으면 바로 알 수 있게 던진다. */
export function requireEnv(key) {
  loadEnv();
  const v = process.env[key];
  if (!v) throw new Error(`환경변수 ${key} 가 없습니다. .env 파일을 확인하세요.`);
  return v;
}
