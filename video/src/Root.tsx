import React from 'react';
import { Composition } from 'remotion';
import { Intro, INTRO_DURATION } from './Intro';
import { FPS } from './theme';

export const Root = () => (
  <Composition
    id="Intro"
    component={Intro}
    durationInFrames={INTRO_DURATION}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
