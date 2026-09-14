// app/dashboard/tokens.ts
//
// The dashboard's colours, in one place so the layout and every page
// agree. Same palette /setup and /start already use — this is a new
// section of the same product, not a new product.
//
// Roles, because a hex on its own tells you nothing:
//
//   paper    the page behind everything
//   surface  cards and rows that sit on the paper
//   ink      body text
//   muted    labels, secondary text, chart tracks
//   rule     hairlines and borders
//   pen      links and the accent for data marks
//   stamp    needs attention now
//   good     nothing to do here
//
// On colour and accessibility: the red (stamp) and green (good) sit
// about ΔE 7.5 apart for deuteranopia, which is below the safe
// threshold — so status on this dashboard is NEVER carried by colour
// alone. Every status row also has a word and a glyph. The colour is
// reinforcement, not the message.
//
// Deliberately light-only. The rest of the app has no dark mode, and
// one page that flips while the others don't reads as a bug.

export const C = {
  paper: '#F5F6F3',
  surface: '#FFFFFF',
  ink: '#1A1D1A',
  muted: '#6B716A',
  rule: '#E2E5DE',
  pen: '#2B4C7E',
  stamp: '#C8332E',
  good: '#3F7A52',
  /** Chart track: one step off the surface, recessive. */
  track: '#ECEEE9',
} as const;
