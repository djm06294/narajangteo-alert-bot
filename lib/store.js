// 저장소 고르기.
//
// DATABASE_URL 이 있으면 Neon, 없으면 .data/ 폴더의 JSON 파일을 쓴다.
// 두 구현은 함수 이름과 돌려주는 모양이 같고, 전부 async 다.
// 부르는 쪽(api/*)은 어느 쪽이 쓰이는지 몰라도 된다.
//
// 파일 저장소는 로컬 전용이다. Vercel 은 /tmp 말고는 쓰기가 안 되고
// 함수가 새로 뜨면 사라지므로, 배포하려면 Neon 이 있어야 한다.
import { loadEnv } from './env.js';

loadEnv();

const useNeon = Boolean(process.env.DATABASE_URL);

const backend = useNeon
  ? await import('./store-neon.js')
  : await import('./store-file.js');

export const STORE_KIND = backend.STORE_KIND;

export const sentKey = backend.sentKey;
export const hasSent = backend.hasSent;
export const markSent = backend.markSent;
export const countSent = backend.countSent;
export const filterUnsent = backend.filterUnsent;

export const logAlert = backend.logAlert;
export const listAlerts = backend.listAlerts;

export const getRules = backend.getRules;
export const saveRules = backend.saveRules;

export const listFavorites = backend.listFavorites;
export const addFavorite = backend.addFavorite;
export const removeFavorite = backend.removeFavorite;
