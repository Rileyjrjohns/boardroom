/**
 * Design tokens. This is the only place where raw colours are written (the lint rules forbid them
 * everywhere else). It holds the tokens that screens use today and grows with them: a token that
 * nothing uses is removed (`tooling/tokens.test.ts` fails on it). Light theme only: the app locks
 * the light appearance (see the README).
 */

export const colors = {
  background: '#ffffff',
  surface: '#f4f5f7',
  border: '#d6d9df',
  textPrimary: '#111111',
  textSecondary: '#555555',
  primary: '#1b4f8f',
  onPrimary: '#ffffff',
  danger: '#a3001d',
  warningBackground: '#fff3cd',
  warningText: '#5b4200',
  neutralBadgeBackground: '#e6e8ec',
  neutralBadgeText: '#2e3138',
  positiveBadgeBackground: '#dff3e4',
  positiveBadgeText: '#14532b',
  confidentialBadgeBackground: '#fde2e5',
  confidentialBadgeText: '#7a1424',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const fontSizes = {
  caption: 13,
  body: 16,
  subtitle: 18,
  title: 24,
} as const;

export const fontWeights = {
  semibold: '600',
  bold: '700',
} as const;

export const radii = {
  sm: 6,
  md: 12,
  pill: 999,
} as const;

export const borderWidths = {
  hairline: 1,
} as const;

/** The smallest size of anything that can be tapped, in points (the platforms' accessibility guidelines). */
export const touchTarget = {
  min: 44,
} as const;

/** How faded a pressed element is. */
export const pressedOpacity = 0.6;
