/**
 * Design tokens. This is the only place where raw colours are written (the lint rules forbid them
 * everywhere else). It holds the tokens that screens use today and grows with them.
 */

export const colors = {
  background: '#ffffff',
  textPrimary: '#111111',
  textSecondary: '#555555',
} as const;

export const spacing = {
  sm: 8,
  lg: 24,
} as const;

export const fontSizes = {
  body: 16,
  title: 28,
} as const;

export const fontWeights = {
  bold: '700',
} as const;
