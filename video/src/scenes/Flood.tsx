// 1·2: 쏟아지는 공고 → 놓치고 있지 않나요?
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { noise } from '../data';
import { BidRow, Caption, fmt, ramp } from '../ui';

const ROW = 84;
export const QUESTION_AT = 170;

export const Flood = () => {
  const frame = useCurrentFrame();
  const count = interpolate(frame, [10, 140], [0, 5214], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  // 처음엔 빠르게 흐르다 질문이 나올 때쯤 멈춘다
  const scroll = interpolate(frame, [0, QUESTION_AT + 30], [0, 6000], {
    extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
  });
  const dim = ramp(frame, QUESTION_AT - 12, QUESTION_AT + 12);
  const first = Math.floor(scroll / ROW);

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{
        position: 'absolute', left: 240, right: 240, top: 0, bottom: 0, overflow: 'hidden',
        filter: `blur(${dim * 7}px)`, opacity: 1 - dim * 0.6, background: C.surface,
        borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
      }}>
        {Array.from({ length: 15 }, (_, k) => {
          const i = first + k;
          return <BidRow key={i} bid={noise(i)} style={{ position: 'absolute', left: 0, right: 0, top: i * ROW - scroll }} />;
        })}
      </div>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - dim, paddingBottom: 60 }}>
        <div style={{
          background: 'rgba(255,255,255,.96)', border: `1px solid ${C.border}`, borderRadius: 28,
          padding: '40px 100px 36px', boxShadow: '0 30px 80px rgba(16,24,40,.16)', textAlign: 'center',
        }}>
          <div style={{ fontFamily: F.sans, fontSize: 32, color: C.muted, fontWeight: 500 }}>최근 3일 나라장터 입찰공고</div>
          <div style={{ fontFamily: F.sans, fontSize: 180, fontWeight: 900, color: C.text, lineHeight: 1.15, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(count)}<span style={{ fontFamily: F.sans, fontSize: 68, marginLeft: 14, fontWeight: 700 }}>건</span>
          </div>
        </div>
      </AbsoluteFill>

      {frame < QUESTION_AT && (
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - dim }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260, background: `linear-gradient(transparent, ${C.bg} 55%)` }} />
          <Caption delay={45}>매일 쏟아지는 공고, 전부 확인하시나요?</Caption>
        </div>
      )}
      {frame >= QUESTION_AT - 12 && (
        <Caption top={380} delay={QUESTION_AT - 6}>
          <span style={{ fontSize: 96, fontWeight: 900, lineHeight: 1.3 }}>
            우리 회사에 맞는 공고,<br />
            <span style={{ color: C.urgent }}>놓치고 있지 않나요?</span>
          </span>
        </Caption>
      )}
    </AbsoluteFill>
  );
};
