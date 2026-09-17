// 4: 키워드를 붙이면 5,214건이 12건으로 줄어든다
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { BLOCKED, MATCHED, noise } from '../data';
import { BidRow, BrandMark, Caption, fmt, ramp, useEnter } from '../ui';

const INCLUDE = [['태양광', 34], ['ESS', 50], ['에너지저장', 66]] as const;
const EXCLUDE = [['유지관리', 150], ['청소', 176]] as const;
const FILTER_AT = 84;       // 포함 키워드로 목록이 바뀌는 시점
const BLOCK_AT = 158;       // 제외어 태그가 붙는 시점
const COLLAPSE_AT = 180;    // 제외된 행이 접히는 시점
const CAPTION_SWAP = 138;

const Chip = ({ word, at, exclude }: { word: string; at: number; exclude?: boolean }) => {
  const p = useEnter(at, 14);
  if (p <= 0.001) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 12px', borderRadius: 6,
      background: exclude ? C.warnBg : C.chip, border: `1px solid ${exclude ? C.warnBorder : C.chipBorder}`,
      transform: `scale(${p})`, opacity: Math.min(1, p * 1.5),
    }}>
      <span style={{ fontSize: 18, fontWeight: 500, color: exclude ? C.urgent : C.accent }}>{word}</span>
      <span style={{ fontFamily: F.mono, fontSize: 18, color: '#8b8f96' }}>×</span>
    </div>
  );
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.06em', color: C.muted2, marginBottom: 12 }}>{children}</div>
);

export const Filter = () => {
  const frame = useCurrentFrame();
  const win = useEnter(0);

  const toMatched = ramp(frame, FILTER_AT, FILTER_AT + 16);
  const collapse = interpolate(frame, [COLLAPSE_AT, COLLAPSE_AT + 16], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic),
  });
  const count = frame < FILTER_AT
    ? 5214
    : frame < COLLAPSE_AT
      ? interpolate(frame, [FILTER_AT, FILTER_AT + 24], [5214, 13], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
      : 12;
  const matchedRows = [MATCHED[0], MATCHED[1], BLOCKED, MATCHED[2], MATCHED[3], MATCHED[4], MATCHED[5]];

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: F.sans }}>
      <div style={{
        position: 'absolute', left: 120, right: 120, top: 56, height: 800,
        background: C.surface, borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.border}`,
        boxShadow: '0 30px 80px rgba(16,24,40,.12)',
        opacity: win, transform: `translateY(${(1 - win) * 40}px)`,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* header */}
        <div style={{ height: 70, display: 'flex', alignItems: 'center', gap: 14, padding: '0 28px', borderBottom: `1px solid ${C.border}` }}>
          <BrandMark size={32} />
          <div style={{ fontSize: 19, fontWeight: 700 }}>나라장터 입찰공고 알림봇</div>
          <div style={{ fontFamily: F.mono, fontSize: 14, color: '#9a9a96' }}>v0.2</div>
          <div style={{ flex: 1 }} />
          {['공고 API 연결됨', '텔레그램 연결됨'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', border: `1px solid ${C.border}`,
              borderRadius: 999, background: C.panel, fontSize: 15, color: C.text2 }}>
              <span style={{ width: 8, height: 8, borderRadius: 9, background: C.ok }} />{t}
            </div>
          ))}
        </div>
        {/* tabs */}
        <div style={{ height: 54, display: 'flex', gap: 6, padding: '0 20px', borderBottom: `1px solid ${C.border}` }}>
          {['검색', '설정', '알림 이력', '즐겨찾기', '텔레그램'].map((t, i) => (
            <div key={t} style={{ padding: '16px 16px 0', fontSize: 17, fontWeight: 500, color: i === 0 ? C.text : C.muted2,
              borderBottom: `2px solid ${i === 0 ? C.accent : 'transparent'}` }}>{t}</div>
          ))}
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* sidebar */}
          <div style={{ width: 330, background: C.panel, borderRight: `1px solid ${C.border}`, padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div>
              <Label>포함 키워드</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 40 }}>
                {INCLUDE.map(([w, at]) => <Chip key={w} word={w} at={at} />)}
              </div>
            </div>
            <div>
              <Label>제외 키워드</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 40 }}>
                {EXCLUDE.map(([w, at]) => <Chip key={w} word={w} at={at} exclude />)}
              </div>
            </div>
            <div style={{ height: 1, background: C.border }} />
            <div>
              <Label>업무유형</Label>
              {['공사', '용역', '물품', '외자'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, fontSize: 17, color: C.text2 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 4, background: C.accent, color: '#fff', fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                  {t}
                </div>
              ))}
            </div>
            <div>
              <Label>조회 기간</Label>
              <div style={{ fontFamily: F.mono, fontSize: 17, color: C.text }}>최근 3일</div>
            </div>
          </div>

          {/* results */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ height: 64, display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 19, color: C.muted }}>
                검색 결과 <b style={{ fontFamily: F.mono, fontSize: 24, color: C.text, fontWeight: 500 }}>{fmt(count)}</b>건
              </div>
              {frame >= COLLAPSE_AT && (
                <div style={{ fontSize: 16, color: C.urgent, opacity: ramp(frame, COLLAPSE_AT, COLLAPSE_AT + 10) }}>
                  제외어로 걸러진 공고 1건
                </div>
              )}
            </div>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 1 - toMatched }}>
                {Array.from({ length: 8 }, (_, i) => <BidRow key={i} bid={noise(i + 300)} />)}
              </div>
              <div style={{ position: 'absolute', inset: 0, opacity: toMatched, transform: `translateY(${(1 - toMatched) * 20}px)` }}>
                {matchedRows.map(b => b === BLOCKED ? (
                  <div key={b.no} style={{ height: 84 * collapse, overflow: 'hidden', opacity: collapse }}>
                    <BidRow bid={b} blockedBy={frame >= BLOCK_AT ? '유지관리' : undefined}
                      style={{ background: frame >= BLOCK_AT ? '#fdf8f6' : C.surface }} />
                  </div>
                ) : <BidRow key={b.no} bid={b} />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {frame < CAPTION_SWAP
        ? <Caption delay={20}>포함 키워드로 <span style={{ color: C.ok }}>필요한 공고만</span> 골라내고</Caption>
        : <Caption delay={CAPTION_SWAP}>제외 키워드로 <span style={{ color: C.urgent }}>관심 없는 공고는 걸러냅니다</span></Caption>}
    </AbsoluteFill>
  );
};
