// 요청 본문 읽기.
export const MAX_BODY = 1_000_000;

/**
 * JSON 본문을 읽는다.
 * 청크를 문자열로 바로 이어붙이면 한글처럼 여러 바이트인 글자가
 * 청크 경계에서 잘려 깨진다. 그래서 Buffer 로 모은 뒤 한 번에 디코딩한다.
 */
export function readJson(req) {
  return new Promise((resolve, reject) => {
    // Vercel 은 본문을 미리 파싱해 req.body 로 줄 때가 있다.
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        try { return resolve(req.body ? JSON.parse(req.body) : {}); }
        catch (e) { return reject(new Error('JSON 형식이 아닙니다')); }
      }
      return resolve(req.body || {});
    }

    const chunks = [];
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('본문이 너무 큽니다'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('JSON 형식이 아닙니다')); }
    });

    req.on('error', reject);
  });
}
