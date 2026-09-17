// 6: 기능 요약 카드
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, F } from '../theme';
import { useEnter } from '../ui';

const CARDS = [
  { icon: '1×', color: C.ok, title: '중복 없이', body: '보낸 공고는 기록해 두고\n두 번 보내지 않습니다' },
  { icon: '↻', color: C.accent, title: '재공고도 다시', body: '차수가 오르면\n새 공고로 알려드립니다' },
  { icon: '★', color: C.gold, title: '즐겨찾기', body: '관심 공고를 담아두면\n기기를 바꿔도 남습니다' },
  { icon: 'D-2', color: C.urgent, title: '마감 임박 표시', body: '남은 날짜를 색으로 보여\n급한 공고부터 봅니다' },
];

const Card = ({ i }: { i: number }) => {
  const p = useEnter(18 + i * 10, 18);
  const c = CARDS[i];
  return (
    <div style={{
      width: 400, height: 430, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 24,
      padding: '44px 36px', boxShadow: '0 20px 50px rgba(16,24,40,.08)', boxSizing: 'border-box',
      opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * 60}px)`,
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: 22, background: C.fill, color: c.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.mono, fontSize: 40, fontWeight: 500,
      }}>{c.icon}</div>
      <div style={{ fontSize: 38, fontWeight: 700, marginTop: 40, letterSpacing: '-.03em', color: C.text }}>{c.title}</div>
      <div style={{ fontSize: 25, lineHeight: 1.55, marginTop: 16, color: C.muted, whiteSpace: 'pre-line' }}>{c.body}</div>
    </div>
  );
};

export const Features = () => {
  const title = useEnter(0);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: F.sans, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: '-.04em', marginBottom: 70, color: C.text,
        opacity: title, transform: `translateY(${(1 - title) * 24}px)` }}>
        알아서 챙기는 알림봇
      </div>
      <div style={{ display: 'flex', gap: 32 }}>
        {CARDS.map((_, i) => <Card key={i} i={i} />)}
      </div>
    </AbsoluteFill>
  );
};
