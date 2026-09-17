// 3 등장 · 7 마무리
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, F } from '../theme';
import { BrandMark, useEnter } from '../ui';

export const Logo = ({ outro = false }: { outro?: boolean }) => {
  const mark = useEnter(0, 14);
  const name = useEnter(10);
  const line = useEnter(24);
  const foot = useEnter(42);

  return (
    <AbsoluteFill style={{ background: outro ? C.ink : C.bg, alignItems: 'center', justifyContent: 'center', fontFamily: F.sans }}>
      <div style={{
        transform: `scale(${mark})`, marginBottom: 48, borderRadius: 30,
        boxShadow: outro ? '0 0 0 2px #4a4d52' : '0 24px 60px rgba(16,24,40,.2)',
      }}>
        <BrandMark size={150} />
      </div>
      <div style={{
        opacity: name, transform: `translateY(${(1 - name) * 24}px)`, fontSize: 96, fontWeight: 900,
        letterSpacing: '-.04em', color: outro ? '#fff' : C.text,
      }}>
        {outro ? '키워드만 정하면, 공고가 찾아옵니다' : '나라장터 입찰공고 알림봇'}
      </div>
      <div style={{
        opacity: line, transform: `translateY(${(1 - line) * 20}px)`, marginTop: 22, fontSize: 40,
        color: outro ? '#b9bdc4' : C.muted,
      }}>
        {outro ? '나라장터 입찰공고 알림봇' : '내 키워드에 맞는 공고만 골라, 텔레그램으로 알려드립니다'}
      </div>
      {outro && (
        <div style={{ opacity: foot, position: 'absolute', bottom: 90, display: 'flex', gap: 18 }}>
          {['조달청 입찰공고 API', 'Telegram Bot', 'Vercel Cron', 'Neon Postgres'].map(t => (
            <span key={t} style={{
              fontFamily: F.mono, fontSize: 22, color: '#9aa0aa', border: '1px solid #4a4d52',
              borderRadius: 999, padding: '8px 22px',
            }}>{t}</span>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};
