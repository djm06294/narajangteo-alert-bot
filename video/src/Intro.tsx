import React from 'react';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { Flood } from './scenes/Flood';
import { Logo } from './scenes/Logo';
import { Filter } from './scenes/Filter';
import { Telegram } from './scenes/Telegram';
import { Features } from './scenes/Features';

const T = 15; // 전환 길이 (프레임)

const SCENES = [
  { el: <Flood />, len: 300 },
  { el: <Logo />, len: 150 },
  { el: <Filter />, len: 285 },
  { el: <Telegram />, len: 300 },
  { el: <Features />, len: 210 },
  { el: <Logo outro />, len: 150 },
];

// 장면끼리 T 프레임씩 겹치므로 그만큼 빠진다
export const INTRO_DURATION = SCENES.reduce((s, x) => s + x.len, 0) - T * (SCENES.length - 1);

const presentations = [fade(), slide({ direction: 'from-right' }), slide({ direction: 'from-right' }), fade(), fade()];

export const Intro = () => (
  <TransitionSeries>
    {SCENES.flatMap((s, i) => [
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.len}>{s.el}</TransitionSeries.Sequence>,
      ...(i < SCENES.length - 1
        ? [<TransitionSeries.Transition key={`t${i}`} presentation={presentations[i]} timing={linearTiming({ durationInFrames: T })} />]
        : []),
    ])}
  </TransitionSeries>
);
