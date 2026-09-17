// 서비스 화면(public/styles.css)의 색 토큰을 그대로 옮겼다.
import { loadFont as loadSans } from '@remotion/google-fonts/NotoSansKR';
import { loadFont as loadMono } from '@remotion/google-fonts/IBMPlexMono';

const sans = loadSans('normal', { weights: ['400', '500', '700', '900'], ignoreTooManyRequestsWarning: true });
const mono = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] });

export const FPS = 30;

export const C = {
  bg: '#f7f8fa',
  surface: '#ffffff',
  panel: '#fafbfc',
  border: '#e6e8ec',
  borderSoft: '#eef0f3',
  text: '#1a1b1d',
  text2: '#3a3c40',
  muted: '#6b6d72',
  muted2: '#8a8c90',
  faint: '#a9aeb8',
  accent: '#3a3a3a',
  ink: '#232629',
  urgent: '#b4491c',
  ok: '#0f7a5a',
  warn: '#c98a22',
  fill: '#f1f3f6',
  chip: '#edeef1',
  chipBorder: '#dcdee3',
  warnBg: '#f7ece7',
  warnBorder: '#eedcd3',
  gold: '#c9962a',
  tg: '#2aabee',
  tgBg: '#dfe9f1',
};

export const F = {
  sans: `${sans.fontFamily}, system-ui, sans-serif`,
  mono: `${mono.fontFamily}, ui-monospace, monospace`,
};
