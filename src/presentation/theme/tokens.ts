/**
 * Design tokens. This is the only place where raw colours are written (the lint rules forbid them
 * everywhere else). It holds the tokens that screens use today and grows with them: a token that
 * nothing uses is removed (`tooling/tokens.test.ts` fails on it). Light theme only: the app locks
 * the light appearance (see the README).
 */

export const colors = {
  background: '#ffffff',
  surface: '#f4f5f7',
  /** The hairline between rows and around cards: decoration, which a screen reader does not need and the eye can do without. */
  border: '#d6d9df',
  /**
   * The edge of what the user operates: a field of text, the track of a switch, a group of
   * segments. It marks where the control is, so it holds at least 3:1 against the background and the
   * surface (WCAG 1.4.11), which `border` does not (about 1.4:1). `tokens.test.ts` pins the ratio.
   */
  interactiveBorder: '#767676',
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
  /** The text of the watermark: dark, and made faint by `watermark.opacity`, so it reads on any page. */
  watermarkText: '#1f2933',
  /** Behind the page of a document, where the page does not reach. */
  documentBackdrop: '#e4e7ec',
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

/**
 * The style of the content of the system bars (clock, signal, battery). The theme is light only, so
 * the content is dark, on both platforms: left to the system it follows the dark mode of the device
 * on Android, and is light on a white header, which hides it.
 */
export const statusBarStyle = 'dark-content' as const;

/** How faded a pressed element is. */
export const pressedOpacity = 0.6;

/** How faded a control that cannot be used is. */
export const disabledOpacity = 0.4;

/** How much of the screen shows through behind a dialog: dark enough to put it in the background. */
export const dimmedOpacity = 0.55;

/**
 * The watermark that is drawn over a confidential document, tile after tile, across the whole area
 * of the page. It identifies the reader on a screenshot or a photograph, so it must stay legible
 * without hiding what is under it.
 */
export const watermark = {
  /** How much of the page shows through: faint enough to read the page, strong enough to read it. */
  opacity: 0.16,
  /** The slope of the lines of text, in degrees: negative rises to the right. */
  angleDegrees: -30,
  /** The width of a tile, text and space around it, in points. */
  tileWidth: 240,
  /** The height of a tile, in points. */
  tileHeight: 96,
  fontSize: 13,
} as const;

/** The widest a form or a dialog gets, in points, so that it stays readable on a tablet. */
export const maxContentWidth = {
  form: 480,
  dialog: 420,
} as const;
