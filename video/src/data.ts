// 화면에 보이는 공고는 모두 예시 값이다.
import { random } from 'remotion';

export type Bid = {
  title: string;
  agency: string;
  no: string;
  type: '공사' | '용역' | '물품' | '외자';
  price: string;
  deadline: string;
  dday: number;
  matched?: string[];
};

const PLACES = ['○○시', '△△군', '□□구', '◇◇도', '☆☆공사', '▽▽공단', '◎◎교육청', '◁◁시청', '▷▷대학교', '▣▣의료원'];
const THINGS = [
  '청사 냉난방기 교체', '도로 포장 보수공사', '정보시스템 유지관리 용역', '사무용 복합기 구매',
  '공원 조경 정비공사', '하수관로 정비사업', '홈페이지 고도화 용역', '청사 청소 용역',
  '방범 CCTV 설치', '급식실 기자재 구매', '노후 상수관 교체공사', '체육관 바닥 교체',
  '통계조사 위탁 용역', '가로등 LED 교체', '소방시설 점검 용역', '전산장비 임차',
];
const TYPES: Bid['type'][] = ['공사', '용역', '물품', '공사', '용역', '물품', '외자'];

export const noise = (i: number): Bid => {
  const r = (k: string) => random(`${k}-${i}`);
  const dday = Math.floor(r('d') * 20);
  return {
    title: `${PLACES[Math.floor(r('p') * PLACES.length)]} ${THINGS[Math.floor(r('t') * THINGS.length)]}`,
    agency: `${PLACES[Math.floor(r('a') * PLACES.length)]}`,
    no: `R26BK${String(Math.floor(r('n') * 9e7)).padStart(8, '0')}`,
    type: TYPES[Math.floor(r('y') * TYPES.length)],
    price: r('m') > 0.5 ? `${(r('q') * 30 + 1).toFixed(1)}억원` : `${Math.floor(r('q') * 9000 + 500).toLocaleString()}만원`,
    deadline: `2026-09-${String(18 + (dday % 12)).padStart(2, '0')} 1${Math.floor(r('h') * 8)}:00`,
    dday,
  };
};

export const MATCHED: Bid[] = [
  { title: '○○시 공공청사 태양광 발전설비 설치공사', agency: '○○시', no: 'R26BK00412871', type: '공사', price: '8.4억원', deadline: '2026-09-19 18:00', dday: 2, matched: ['태양광'] },
  { title: '△△산업단지 ESS 에너지저장장치 구매', agency: '△△공단', no: 'R26BK00413002', type: '물품', price: '23.0억원', deadline: '2026-09-24 10:00', dday: 7, matched: ['ESS', '에너지저장'] },
  { title: '□□구 공동주택 옥상 태양광 보급사업', agency: '□□구', no: 'R26BK00413155', type: '공사', price: '3.2억원', deadline: '2026-09-22 17:00', dday: 5, matched: ['태양광'] },
  { title: '◇◇도 신재생 ESS 설치 타당성 조사 용역', agency: '◇◇도', no: 'R26BK00413390', type: '용역', price: '9,800만원', deadline: '2026-09-26 14:00', dday: 9, matched: ['ESS'] },
  { title: '◎◎교육청 학교 태양광 설비 구매', agency: '◎◎교육청', no: 'R26BK00413421', type: '물품', price: '4.7억원', deadline: '2026-09-29 11:00', dday: 12, matched: ['태양광'] },
  { title: '▽▽공사 사옥 에너지저장장치 증설공사', agency: '▽▽공사', no: 'R26BK00413508', type: '공사', price: '12.5억원', deadline: '2026-09-30 16:00', dday: 13, matched: ['에너지저장'] },
];

// 제외어에 걸리는 예시 — 필터 장면에서 빨간 태그로 잠깐 보였다가 사라진다
export const BLOCKED: Bid = {
  title: '□□시 태양광 발전소 유지관리 용역', agency: '□□시', no: 'R26BK00412990', type: '용역', price: '1.1억원', deadline: '2026-09-21 18:00', dday: 4, matched: ['태양광'],
};
