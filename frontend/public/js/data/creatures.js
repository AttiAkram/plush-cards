/**
 * SVG artwork definitions for each creature card.
 *
 * Each entry has:
 *   color  — base fill colour used via `fill` attribute on the <svg>
 *   svg    — SVG shapes as an inner-HTML string (viewBox 0 0 32 32)
 *
 * The art is intentionally simple / geometric so it renders crisply at
 * the small card size (≈ 58% of the image area).
 */

/** @typedef {{ color: string, svg: string }} CreatureArt */

/** @type {Record<string, CreatureArt>} */
export const CREATURES = {

  orso: {
    color: '#795548',
    svg: `
      <ellipse cx="16" cy="17" rx="9" ry="8"/>
      <circle cx="8.5" cy="10" r="3.5"/>
      <circle cx="23.5" cy="10" r="3.5"/>
      <circle cx="8.5"  cy="10" r="1.8" fill="rgba(255,255,255,0.15)"/>
      <circle cx="23.5" cy="10" r="1.8" fill="rgba(255,255,255,0.15)"/>
      <circle cx="12.5" cy="16" r="1.5" fill="rgba(0,0,0,0.4)"/>
      <circle cx="19.5" cy="16" r="1.5" fill="rgba(0,0,0,0.4)"/>
      <circle cx="12.5" cy="15.2" r="0.5" fill="rgba(255,255,255,0.5)"/>
      <circle cx="19.5" cy="15.2" r="0.5" fill="rgba(255,255,255,0.5)"/>
      <ellipse cx="16" cy="20.5" rx="2.5" ry="1.5" fill="rgba(0,0,0,0.3)"/>`,
  },

  panda: {
    color: '#37474f',
    svg: `
      <circle cx="16" cy="16" r="9" fill="rgba(255,255,255,0.85)"/>
      <circle cx="8"  cy="8"  r="3.5"/>
      <circle cx="24" cy="8"  r="3.5"/>
      <ellipse cx="11" cy="14" rx="3.5" ry="3"/>
      <ellipse cx="21" cy="14" rx="3.5" ry="3"/>
      <circle cx="11" cy="14" r="1.5" fill="rgba(255,255,255,0.8)"/>
      <circle cx="21" cy="14" r="1.5" fill="rgba(255,255,255,0.8)"/>
      <circle cx="11" cy="14" r="0.8" fill="rgba(0,0,0,0.9)"/>
      <circle cx="21" cy="14" r="0.8" fill="rgba(0,0,0,0.9)"/>
      <ellipse cx="16" cy="20" rx="2" ry="1.2" fill="rgba(55,71,79,0.6)"/>`,
  },

  gatto: {
    color: '#8d6e63',
    svg: `
      <ellipse cx="16" cy="17" rx="9" ry="8"/>
      <polygon points="9,12 6,3 14,10"/>
      <polygon points="23,12 26,3 18,10"/>
      <polygon points="9,11 7,5 13,9" fill="rgba(255,255,255,0.2)"/>
      <polygon points="23,11 25,5 19,9" fill="rgba(255,255,255,0.2)"/>
      <ellipse cx="12" cy="16" rx="2" ry="1.5" fill="rgba(0,0,0,0.4)"/>
      <ellipse cx="20" cy="16" rx="2" ry="1.5" fill="rgba(0,0,0,0.4)"/>
      <circle cx="12.5" cy="15.3" r="0.6" fill="rgba(255,255,255,0.5)"/>
      <circle cx="20.5" cy="15.3" r="0.6" fill="rgba(255,255,255,0.5)"/>
      <circle cx="16" cy="20" r="1" fill="rgba(0,0,0,0.3)"/>`,
  },

  coniglio: {
    color: '#ec407a',
    svg: `
      <ellipse cx="11" cy="8"  rx="3"  ry="6.5"/>
      <ellipse cx="21" cy="8"  rx="3"  ry="6.5"/>
      <ellipse cx="11" cy="8"  rx="1.5" ry="4.5" fill="rgba(255,255,255,0.3)"/>
      <ellipse cx="21" cy="8"  rx="1.5" ry="4.5" fill="rgba(255,255,255,0.3)"/>
      <ellipse cx="16" cy="19" rx="8"  ry="7"/>
      <circle cx="12.5" cy="18" r="1.5" fill="rgba(0,0,0,0.35)"/>
      <circle cx="19.5" cy="18" r="1.5" fill="rgba(0,0,0,0.35)"/>
      <circle cx="13"   cy="17.3" r="0.5" fill="rgba(255,255,255,0.5)"/>
      <circle cx="20"   cy="17.3" r="0.5" fill="rgba(255,255,255,0.5)"/>
      <circle cx="16"   cy="21"   r="1.2" fill="rgba(0,0,0,0.25)"/>`,
  },

  volpe: {
    color: '#e64a19',
    svg: `
      <ellipse cx="16" cy="17" rx="9" ry="8"/>
      <polygon points="9,12 6,2 15,10"/>
      <polygon points="23,12 26,2 17,10"/>
      <polygon points="9.5,11 7.5,4 13.5,9"   fill="rgba(255,255,255,0.25)"/>
      <polygon points="22.5,11 24.5,4 18.5,9"  fill="rgba(255,255,255,0.25)"/>
      <ellipse cx="16" cy="21" rx="4.5" ry="2.5" fill="rgba(255,255,255,0.15)"/>
      <ellipse cx="12.5" cy="16" rx="1.8" ry="1.8" fill="rgba(0,0,0,0.4)"/>
      <ellipse cx="19.5" cy="16" rx="1.8" ry="1.8" fill="rgba(0,0,0,0.4)"/>
      <circle cx="13" cy="15.4" r="0.5" fill="rgba(255,255,255,0.5)"/>
      <circle cx="20" cy="15.4" r="0.5" fill="rgba(255,255,255,0.5)"/>
      <ellipse cx="16" cy="21"   rx="1.5" ry="1" fill="rgba(0,0,0,0.35)"/>`,
  },

  gufo: {
    color: '#5d4037',
    svg: `
      <ellipse cx="16" cy="17" rx="8" ry="9"/>
      <polygon points="10,10 8,3 13.5,9"/>
      <polygon points="22,10 24,3 18.5,9"/>
      <circle cx="12" cy="15" r="3.5" fill="rgba(255,255,255,0.2)"/>
      <circle cx="20" cy="15" r="3.5" fill="rgba(255,255,255,0.2)"/>
      <circle cx="12" cy="15" r="2.2" fill="rgba(0,0,0,0.5)"/>
      <circle cx="20" cy="15" r="2.2" fill="rgba(0,0,0,0.5)"/>
      <circle cx="12.8" cy="14.2" r="0.7" fill="rgba(255,255,255,0.7)"/>
      <circle cx="20.8" cy="14.2" r="0.7" fill="rgba(255,255,255,0.7)"/>
      <polygon points="14,19 18,19 16,22" fill="rgba(255,190,0,0.75)"/>`,
  },

  lupo: {
    color: '#546e7a',
    svg: `
      <ellipse cx="16" cy="16" rx="9" ry="8"/>
      <polygon points="9,12 6,2 14,9"/>
      <polygon points="23,12 26,2 18,9"/>
      <polygon points="9.5,11 7.5,4 13,9"  fill="rgba(255,255,255,0.15)"/>
      <polygon points="22.5,11 24.5,4 19,9" fill="rgba(255,255,255,0.15)"/>
      <ellipse cx="16" cy="20" rx="5" ry="3" fill="rgba(255,255,255,0.1)"/>
      <ellipse cx="12.5" cy="14" rx="2" ry="1.5" fill="rgba(0,0,0,0.4)"/>
      <ellipse cx="19.5" cy="14" rx="2" ry="1.5" fill="rgba(0,0,0,0.4)"/>
      <circle cx="13" cy="13.4" r="0.6" fill="rgba(255,255,255,0.45)"/>
      <circle cx="20" cy="13.4" r="0.6" fill="rgba(255,255,255,0.45)"/>
      <ellipse cx="16" cy="20" rx="2" ry="1.2" fill="rgba(0,0,0,0.4)"/>`,
  },

  drago: {
    color: '#2e7d32',
    svg: `
      <ellipse cx="5.5"  cy="18" rx="4" ry="6" fill="currentColor" opacity="0.45" transform="rotate(-25,5.5,18)"/>
      <ellipse cx="26.5" cy="18" rx="4" ry="6" fill="currentColor" opacity="0.45" transform="rotate(25,26.5,18)"/>
      <ellipse cx="16"   cy="16" rx="8" ry="7"/>
      <polygon points="9,11 7,2 14,9"/>
      <polygon points="23,11 25,2 18,9"/>
      <ellipse cx="12" cy="15" rx="2.2" ry="2.2" fill="rgba(255,210,0,0.75)"/>
      <ellipse cx="20" cy="15" rx="2.2" ry="2.2" fill="rgba(255,210,0,0.75)"/>
      <rect x="11.5" y="14.5" width="1" height="1" rx="0.3" fill="rgba(0,0,0,0.8)"/>
      <rect x="19.5" y="14.5" width="1" height="1" rx="0.3" fill="rgba(0,0,0,0.8)"/>
      <circle cx="14.5" cy="19" r="0.7" fill="rgba(0,0,0,0.3)"/>
      <circle cx="17.5" cy="19" r="0.7" fill="rgba(0,0,0,0.3)"/>`,
  },

  unicorno: {
    color: '#7b1fa2',
    svg: `
      <ellipse cx="16"  cy="18" rx="9" ry="7"/>
      <polygon points="16,2 13.5,12 18.5,12" fill="rgba(255,215,64,0.9)"/>
      <circle  cx="16"  cy="2.5" r="1.2" fill="rgba(255,215,64,1)"/>
      <ellipse cx="24"  cy="10"  rx="2.5" ry="5" fill="currentColor" opacity="0.5"/>
      <polygon points="21,12 23.5,5 26,12"/>
      <polygon points="21.5,12 23.5,6.5 25,12" fill="rgba(255,255,255,0.25)"/>
      <ellipse cx="12"  cy="17"  rx="2" ry="2" fill="rgba(0,0,0,0.3)"/>
      <circle  cx="11.5" cy="16.3" r="0.6" fill="rgba(255,255,255,0.7)"/>
      <ellipse cx="16"  cy="22"  rx="3" ry="1.5" fill="rgba(255,255,255,0.1)"/>`,
  },

  fenice: {
    color: '#c62828',
    svg: `
      <ellipse cx="6"  cy="14" rx="5.5" ry="3.5" fill="currentColor" opacity="0.6" transform="rotate(-30,6,14)"/>
      <ellipse cx="26" cy="14" rx="5.5" ry="3.5" fill="currentColor" opacity="0.6" transform="rotate(30,26,14)"/>
      <ellipse cx="13" cy="25" rx="1.8" ry="4" fill="currentColor" opacity="0.55" transform="rotate(-15,13,25)"/>
      <ellipse cx="16" cy="26" rx="1.8" ry="4" fill="currentColor" opacity="0.65"/>
      <ellipse cx="19" cy="25" rx="1.8" ry="4" fill="currentColor" opacity="0.55" transform="rotate(15,19,25)"/>
      <circle  cx="16" cy="12" r="5"/>
      <ellipse cx="16" cy="7"  rx="2" ry="4" fill="currentColor" opacity="0.7"/>
      <polygon points="14,13 18,13 16,16" fill="rgba(255,200,0,0.85)"/>
      <circle  cx="14" cy="11" r="1.3" fill="rgba(255,215,64,0.9)"/>
      <circle  cx="14.3" cy="10.5" r="0.4" fill="rgba(0,0,0,0.6)"/>`,
  },
};

/** Fallback art for unknown card IDs (generic paw print). */
export const CREATURE_FALLBACK = {
  color: '#616161',
  svg: `
    <circle cx="16" cy="14" r="7"/>
    <circle cx="10" cy="21" r="3"/>
    <circle cx="16" cy="23" r="3"/>
    <circle cx="22" cy="21" r="3"/>
    <circle cx="7"  cy="16" r="2"/>
    <circle cx="25" cy="16" r="2"/>`,
};
