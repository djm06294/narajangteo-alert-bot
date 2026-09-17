// 5: 21:00 → 휴대폰에 알림 도착. 메시지 형식은 lib/telegram.js 의 formatBundle 을 따른다.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { MATCHED, type Bid } from '../data';
import { ramp, useEnter } from '../ui';

const TICK_AT = 34;
const MSG1_AT = 62;
const MSG2_AT = 150;

const BidBlock = ({ bid }: { bid: Bid }) => (
  <div style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, color: C.text }}>{bid.title}</div>
    {[['공고번호', `${bid.no} (000차)`], ['발주기관', bid.agency], ['추정가격', bid.price], ['마감일시', `${bid.deadline} (D-${bid.dday})`]].map(([k, v]) => (
      <div key={k} style={{ color: C.text2 }}>{k}  {v}</div>
    ))}
    <div style={{ color: '#168acd' }}>공고 원문 보기</div>
  </div>
);

const Message = ({ header, bids, at, time }: { header: string; bids: Bid[]; at: number; time: string }) => {
  const p = useEnter(at, 16);
  return (
    <div style={{
      alignSelf: 'flex-start', maxWidth: 440, background: '#fff', borderRadius: '18px 18px 18px 6px',
      padding: '14px 18px 10px', fontSize: 17, lineHeight: 1.5, boxShadow: '0 1px 2px rgba(0,0,0,.12)',
      transform: `translateY(${(1 - p) * 40}px) scale(${0.9 + p * 0.1})`, opacity: p, transformOrigin: 'bottom left',
    }}>
      <div style={{ fontWeight: 700, color: C.text }}>{header}</div>
      {bids.map(b => <BidBlock key={b.no} bid={b} />)}
      <div style={{ textAlign: 'right', fontSize: 13, color: '#8fa0ae', marginTop: 4 }}>{time}</div>
    </div>
  );
};

export const Telegram = () => {
  const frame = useCurrentFrame();
  const left = useEnter(0);
  const phone = useEnter(8);
  const ticked = frame >= TICK_AT;
  const flip = ramp(frame, TICK_AT - 4, TICK_AT + 6);
  const pulse = frame >= MSG1_AT ? Math.max(0, 1 - (frame - MSG1_AT) / 24) : 0;

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: F.sans }}>
      {/* 왼쪽: 시계와 설명 */}
      <div style={{ position: 'absolute', left: 170, top: 250, width: 860, opacity: left, transform: `translateX(${(1 - left) * -40}px)` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderRadius: 10,
          background: C.fill, fontFamily: F.mono, fontSize: 24, color: C.muted }}>
          <span style={{ width: 10, height: 10, borderRadius: 9, background: ticked ? C.ok : '#c4c9d2' }} />
          {ticked ? '알림 배치 실행 중' : '다음 실행 대기'}
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 230, fontWeight: 500, letterSpacing: '-.05em', lineHeight: 1.1, marginTop: 20, color: C.text }}>
          <span style={{ display: 'inline-block', transform: `translateY(${(flip < 0.5 ? -flip : 1 - flip) * 30}px)`, opacity: 1 - Math.sin(flip * Math.PI) * 0.7 }}>
            {ticked ? '21:00' : '20:59'}
          </span>
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.3, marginTop: 20 }}>
          매일 저녁 9시,<br />새 공고가 <span style={{ color: C.tg }}>텔레그램</span>으로
        </div>
        <div style={{ fontSize: 30, color: C.muted, marginTop: 26, opacity: ramp(frame, MSG1_AT + 10, MSG1_AT + 30) }}>
          한 통에 5건씩 묶어서, 공고 원문 링크까지
        </div>
      </div>

      {/* 오른쪽: 휴대폰 */}
      <div style={{
        position: 'absolute', right: 200, top: 70, width: 540, height: 940, borderRadius: 64, background: '#15171a', padding: 16,
        boxShadow: '0 40px 90px rgba(16,24,40,.28)', opacity: phone, transform: `translateY(${(1 - phone) * 60}px)`,
      }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 50, overflow: 'hidden', background: C.tgBg, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 130, background: '#fff', display: 'flex', alignItems: 'flex-end', gap: 14, padding: '0 24px 18px',
            borderBottom: '1px solid #d8dde2' }}>
            <div style={{ width: 52, height: 52, borderRadius: 99, background: C.accent, color: '#fff', fontFamily: F.mono, fontSize: 17,
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 ${pulse * 12}px rgba(42,171,238,${pulse * 0.35})` }}>NJT</div>
            <div>
              <div style={{ fontSize: 21, fontWeight: 700, color: C.text }}>입찰공고 알림방</div>
              <div style={{ fontSize: 15, color: '#8fa0ae' }}>bot</div>
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Message at={MSG1_AT} time="21:00" header="🔔 새 공고 1/2 · 태양광" bids={[MATCHED[0], MATCHED[2]]} />
              {frame >= MSG2_AT && <Message at={MSG2_AT} time="21:00" header="🔔 새 공고 2/2 · ESS" bids={[MATCHED[1], MATCHED[3]]} />}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
