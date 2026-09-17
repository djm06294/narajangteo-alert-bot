// /api/rules — 알림 규칙. GET 은 읽고, POST 는 저장한다.
//
// 브라우저 localStorage 는 크론이 읽을 수 없다. 자동 실행에 쓸 규칙은 서버에 있어야 한다.
import { getRules, saveRules } from '../lib/store.js';
import { readJson } from '../lib/http.js';

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (req.method === 'POST') {
    try {
      const body = await readJson(req);
      // 받은 값 중 규칙에 해당하는 것만 고른다.
      const allowed = ['keywords', 'excludes', 'types', 'lookback', 'maxPrice',
                       'maxDaysLeft', 'interval', 'quietStart', 'quietEnd', 'weekend', 'fields'];
      const patch = {};
      for (const k of allowed) if (k in body) patch[k] = body[k];

      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, rules: await saveRules(patch) }));
    } catch (err) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, rules: await getRules() }));
}
