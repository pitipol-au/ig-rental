// app/dashboard/theme.ts
//
// "แผงร้าน" — the counter. One place for every colour and every
// radius, so the four tabs cannot drift apart.
//
// ─────────────────────────────────────────────────────────────
// WHY COLOURS LIVE IN TYPESCRIPT AND NOT IN tailwind.config
//
// Putting them in the Tailwind config would be tidier, and it would
// mean editing your build configuration to change a shade of green.
// Every hour we have lost on this project has been install friction,
// not code. So: layout comes from Tailwind utility classes, which
// work on any Tailwind version, and colour comes from here as inline
// styles. Nothing to configure, nothing to break.
//
// If you later want these as Tailwind tokens, this file is the list
// to paste in.
// ─────────────────────────────────────────────────────────────

export const C = {
  /** Page behind everything. Barely off-white — a true #FFF page with
   *  white cards on it has no depth at all. */
  ground: '#F7F8F7',
  surface: '#FFFFFF',

  ink: '#12171C',
  /** Secondary text: labels, dates, the detail line under a task. */
  ink2: '#6B7076',
  /** Third tier: tab labels, timestamps. */
  ink3: '#9BA1A6',

  line: '#E9EBEA',

  /** The shop's colour. Jade rather than a blue, because every other
   *  Thai commerce app is orange or blue and this should not be
   *  mistaken for one of them. */
  accent: '#0B6B54',
  accentSoft: '#E7F3EE',

  /** Needs you now. */
  urgent: '#C4432F',
  urgentTint: '#FDF1EE',
  urgentLine: '#F6D9D1',

  /** Worth doing, not bleeding. */
  warn: '#B07A12',
  warnTint: '#FBF5E9',

  /** Nothing to do here. */
  good: '#0B6B54',
} as const;

export const R = {
  card: 14,
  chip: 8,
  pill: 999,
} as const;

/**
 * Status → how it looks, in one place.
 *
 * Colour is never the only signal: every consumer of this also
 * renders `word`. The urgent red and the accent jade are far enough
 * apart to be safe, but the warn amber and the urgent red are not,
 * for a colourblind owner. The word settles it.
 */
export const SEVERITY = {
  urgent: { dot: C.urgent, tint: C.urgentTint, line: C.urgentLine, word: 'ด่วน' },
  warn: { dot: C.warn, tint: C.warnTint, line: C.line, word: 'ควรทำ' },
} as const;

export type Severity = keyof typeof SEVERITY;
