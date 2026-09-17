import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from './theme';
import type { Bid } from './data';

/** 등장 애니메이션 값 (0→1). delay 는 프레임. */
export const useEnter = (delay = 0, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

export const BrandMark = ({ size = 26 }: { size?: number }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.2, background: C.accent, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: F.mono, fontWeight: 500, fontSize: size * 0.38, letterSpacing: '.02em',
  }}>NJT</div>
);

/** 자막. top 을 주지 않으면 화면 아래에 붙는다. */
export const Caption = ({ children, delay = 0, top }: { children: React.ReactNode; delay?: number; top?: number }) => {
  const p = useEnter(delay);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0,
      ...(top == null ? { bottom: 70 } : { top }),
      textAlign: 'center', fontFamily: F.sans, fontWeight: 700, fontSize: 58, color: C.text,
      letterSpacing: '-.03em', opacity: p, transform: `translateY(${(1 - p) * 30}px)`,
    }}>{children}</div>
  );
};

export const Tag = ({ children, kind = 'match' }: { children: React.ReactNode; kind?: 'match' | 'blocked' }) => (
  <span style={{
    fontFamily: F.sans, fontSize: 15, fontWeight: 500, padding: '2px 8px', borderRadius: 5,
    background: kind === 'blocked' ? C.warnBg : C.chip,
    border: `1px solid ${kind === 'blocked' ? C.warnBorder : C.chipBorder}`,
    color: kind === 'blocked' ? C.urgent : C.accent,
  }}>{children}</span>
);

export const BidRow = ({ bid, blockedBy, style }: {
  bid: Bid; blockedBy?: string; style?: React.CSSProperties;
}) => {
  const urgent = bid.dday <= 3;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 22, padding: '0 28px', height: 84,
      background: C.surface, borderBottom: `1px solid ${C.borderSoft}`,
      fontFamily: F.sans, boxSizing: 'border-box', ...style,
    }}>
      <div style={{ width: 70, display: 'flex', alignItems: 'center', gap: 8, fontFamily: F.mono, fontSize: 17,
        color: urgent ? C.urgent : C.muted }}>
        <span style={{ width: 8, height: 8, borderRadius: 9, background: urgent ? C.urgent : bid.dday <= 7 ? C.warn : C.ok }} />
        D-{bid.dday}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 21, fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bid.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 15, color: C.muted2 }}>
          <span>{bid.agency}</span>
          <span style={{ fontFamily: F.mono }}>{bid.no}</span>
          {bid.matched?.map(m => <Tag key={m}>{m}</Tag>)}
          {blockedBy && <Tag kind="blocked">제외어: {blockedBy}</Tag>}
        </div>
      </div>
      <div style={{ width: 50, fontSize: 17, color: C.text2 }}>{bid.type}</div>
      <div style={{ width: 120, fontSize: 17, fontFamily: F.mono, color: C.text, textAlign: 'right' }}>{bid.price}</div>
      <div style={{ width: 190, fontSize: 16, fontFamily: F.mono, color: C.muted, textAlign: 'right' }}>{bid.deadline}</div>
    </div>
  );
};

export const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** from~to 프레임 동안 0→1, 양끝 고정 */
export const ramp = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
