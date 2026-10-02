import type { ReactNode } from 'react';

/**
 * Nebula icon set: 24px grid, 1.8px rounded strokes, and one soft duotone shape (`.icon-duo`,
 * filled with currentColor at low opacity) per glyph for depth. Everything is drawn in
 * currentColor, so icons follow the theme and the user's custom accent colors. No Unicode
 * glyph is ever used in the interface.
 *
 * The first block is ported verbatim from Nebula Finterest v0.1.36
 * `src/renderer/components/Icon.tsx`; the second block adds the Store's icons, drawn in the
 * same style.
 */
const duo = { className: 'icon-duo' };
const duoFill = { className: 'icon-duo', stroke: 'none' };
const dot = { fill: 'currentColor', stroke: 'none' };

const glyphs = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="9" rx="2" {...duo} />
      <rect x="13.5" y="3.5" width="7" height="5" rx="2" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="2" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <rect x="13" y="13" width="4.5" height="4.5" rx="1.2" {...duo} />
    </>
  ),
  repeat: (
    <>
      <path d="M19.5 10.5A7.8 7.8 0 0 0 5.6 7.4L4 9" />
      <path d="M4 4.5V9h4.5" />
      <path d="M4.5 13.5a7.8 7.8 0 0 0 13.9 3.1L20 15" />
      <path d="M20 19.5V15h-4.5" />
      <circle cx="12" cy="12" r="2.6" {...duo} />
    </>
  ),
  bag: (
    <>
      <path d="M5.5 8h13l-1 11.2a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8z" {...duo} />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </>
  ),
  bank: (
    <>
      <path d="M3.5 9.5 12 4l8.5 5.5z" {...duo} />
      <path d="M6 12v5M10 12v5M14 12v5M18 12v5" />
      <path d="M3.5 20h17" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" {...duo} />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20" />
      <circle cx="15" cy="7" r="2.3" {...duo} />
      <circle cx="9" cy="17" r="2.3" {...duo} />
    </>
  ),
  trendUp: (
    <>
      <path d="M3.5 17 9 11.5l3.5 3.5 8-8" />
      <path d="M15 7h5.5v5.5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 8V7.5A2.5 2.5 0 0 1 6.5 5H16v3" />
      <rect x="4" y="8" width="16.5" height="11.5" rx="2.5" {...duo} />
      <circle cx="16" cy="13.75" r="1.3" {...dot} />
    </>
  ),
  calculator: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" {...duo} />
      <path d="M8.5 7.5h7" />
      <circle cx="9" cy="12" r="0.9" {...dot} /><circle cx="12" cy="12" r="0.9" {...dot} /><circle cx="15" cy="12" r="0.9" {...dot} />
      <circle cx="9" cy="16" r="0.9" {...dot} /><circle cx="12" cy="16" r="0.9" {...dot} /><circle cx="15" cy="16" r="0.9" {...dot} />
    </>
  ),
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
      <path d="m6.5 7 .8 11.6a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" {...duo} />
    </>
  ),
  power: (
    <>
      <path d="M12 3.5v8" />
      <path d="M7.2 6.6a7.5 7.5 0 1 0 9.6 0" />
    </>
  ),
  sparkles: (
    <>
      <path d="m11 3.5 1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z" {...duo} />
      <path d="M18.5 15v4.5M16.25 17.25h4.5" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...duo} />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...duo} />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),
  folderSync: (
    <>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" {...duo} />
      <path d="M14.8 12.2a3 3 0 0 0-5.3-1.1M9.2 14.8a3 3 0 0 0 5.3 1.1" />
      <path d="M9.5 9.4v1.7h1.7M14.5 17.6v-1.7h-1.7" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-2l-.3-.8a1.6 1.6 0 0 1 1.5-2.2h2.3a3.6 3.6 0 0 0 3.6-3.6c0-4.8-3.8-8.4-8.5-8.4z" {...duo} />
      <circle cx="7.8" cy="11.5" r="1.2" {...dot} />
      <circle cx="10" cy="7.6" r="1.2" {...dot} />
      <circle cx="14.6" cy="7.6" r="1.2" {...dot} />
    </>
  ),
  droplet: (
    <>
      <path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z" {...duo} />
      <path d="M9.2 14.5a2.9 2.9 0 0 0 2.3 2.6" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8z" {...duo} />
      <path d="m3.5 12 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16 8.5 4.5 8.5-4.5" />
    </>
  ),
  bolt: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12z" {...duo} />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.2-3.5-8.5S9.6 5.8 12 3.5z" {...duo} />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" {...duo} />,
  logout: (
    <>
      <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
      <path d="M10 16.5 5.5 12 10 7.5" />
      <path d="M5.5 12H15" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...duo} />
      <circle cx="12" cy="12.5" r="3.2" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" {...duo} />
      <path d="M12 7.5V13" />
      <circle cx="12" cy="16.3" r="0.95" {...dot} />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" {...duo} />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.95" {...dot} />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" {...duo} />
      <path d="M9.5 20.5V15h5v5.5" />
    </>
  ),
  wifi: (
    <>
      <path d="M3.5 9.5a12 12 0 0 1 17 0" />
      <path d="M6.5 12.8a7.5 7.5 0 0 1 11 0" />
      <path d="M9.5 16a3.5 3.5 0 0 1 5 0" />
      <circle cx="12" cy="19" r="1.2" {...dot} />
    </>
  ),
  play: (
    <>
      <rect x="3.5" y="4.5" width="17" height="12.5" rx="2.5" {...duo} />
      <path d="m10.5 8.3 4 2.45-4 2.45z" fill="currentColor" />
      <path d="M8.5 20.5h7" />
    </>
  ),
  car: (
    <>
      <path d="M5.5 12 7 8a2 2 0 0 1 1.9-1.5h6.2A2 2 0 0 1 17 8l1.5 4" />
      <rect x="4" y="12" width="16" height="5.5" rx="1.8" {...duo} />
      <path d="M6.5 17.5v2M17.5 17.5v2" />
      <circle cx="8" cy="14.75" r="0.95" {...dot} />
      <circle cx="16" cy="14.75" r="0.95" {...dot} />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.3-3 7.7-7 9-4-1.3-7-4.7-7-9V6z" {...duo} />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  heart: <path d="M12 19.5s-7.5-4.4-7.5-9.7A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6c0 5.3-7.5 9.7-7.5 9.7z" {...duo} />,
  tag: (
    <>
      <path d="M3.5 12.3V5A1.5 1.5 0 0 1 5 3.5h7.3l8.2 8.2a1.5 1.5 0 0 1 0 2.1l-7.2 7.2a1.5 1.5 0 0 1-2.1 0z" {...duo} />
      <circle cx="8" cy="8" r="1.4" {...dot} />
    </>
  ),

  // ---- Nebula Store additions ----
  store: (
    <>
      <path d="M3.5 9.5 5 4.5h14l1.5 5a2.5 2.5 0 0 1-4.9.7 2.6 2.6 0 0 1-5.1 0 2.6 2.6 0 0 1-5.1 0A2.5 2.5 0 0 1 3.5 9.5z" {...duo} />
      <path d="M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7" />
      <path d="M10 20.5V16h4v4.5" />
    </>
  ),
  grid: (
    <>
      <circle cx="12" cy="12" r="2.6" {...duoFill} />
      <circle cx="5.5" cy="5.5" r="1.6" {...dot} /><circle cx="12" cy="5.5" r="1.6" {...dot} /><circle cx="18.5" cy="5.5" r="1.6" {...dot} />
      <circle cx="5.5" cy="12" r="1.6" {...dot} /><circle cx="12" cy="12" r="1.6" {...dot} /><circle cx="18.5" cy="12" r="1.6" {...dot} />
      <circle cx="5.5" cy="18.5" r="1.6" {...dot} /><circle cx="12" cy="18.5" r="1.6" {...dot} /><circle cx="18.5" cy="18.5" r="1.6" {...dot} />
    </>
  ),
  link: (
    <>
      <circle cx="12" cy="12" r="2.4" {...duoFill} />
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3.2-3.2a3.6 3.6 0 0 0-5.1-5.1l-1.1 1.1" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3.2 3.2a3.6 3.6 0 0 0 5.1 5.1l1.1-1.1" />
    </>
  ),
  puzzle: (
    <path d="M4.5 8h3.4a2.1 2.1 0 1 1 4.2 0h3.4v3.4a2.1 2.1 0 1 1 0 4.2V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19z" {...duo} />
  ),
  package: (
    <>
      <path d="M12 3.5 20 7.5v9l-8 4-8-4v-9z" {...duo} />
      <path d="m4 7.5 8 4 8-4" />
      <path d="M12 11.5v9" />
      <path d="m8 5.5 8 4" />
    </>
  ),
  update: (
    <>
      <circle cx="12" cy="12" r="5" {...duoFill} />
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
      <path d="M12 8.5v6" />
      <path d="m9.5 12.5 2.5 2.5 2.5-2.5" />
    </>
  ),
  repair: (
    <path d="M14.8 4a4.5 4.5 0 0 0-4.9 6l-5.4 5.4a1.9 1.9 0 0 0 2.7 2.7l5.4-5.4a4.5 4.5 0 0 0 6-4.9l-2.6 2.6-2.5-.4-.4-2.5z" {...duo} />
  ),
  uninstall: (
    <>
      <path d="M12 3.5 19.5 7.3v4.2" />
      <path d="M4.5 7.3 12 3.5" />
      <path d="M4.5 7.3v8.9l7.5 3.8" />
      <path d="m4.5 7.3 7.5 3.8 7.5-3.8" />
      <path d="M12 11.1v8.9" />
      <circle cx="17.5" cy="17.5" r="3.5" {...duo} />
      <path d="M16 17.5h3" />
    </>
  ),
  tray: (
    <>
      <rect x="3.5" y="14.5" width="17" height="6" rx="2" {...duo} />
      <path d="M12 11.5v-7" />
      <path d="m8.5 8 3.5-3.5L15.5 8" />
      <circle cx="13.5" cy="17.5" r="0.95" {...dot} />
      <circle cx="16.8" cy="17.5" r="0.95" {...dot} />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" {...duo} />
      <path d="M10 20.8a2.1 2.1 0 0 0 4 0" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1.5" {...duo} />
      <rect x="14" y="4.5" width="4" height="15" rx="1.5" {...duo} />
    </>
  ),
  external: (
    <>
      <path d="M18 14v4.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H11" {...duo} />
      <path d="M13.5 4.5h6v6" />
      <path d="M19.5 4.5 11 13" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" {...duo} />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="5.2" {...duoFill} />
      <path d="M4.2 12a7.8 7.8 0 1 0 2.3-5.5" />
      <path d="M4 4.5V9h4.5" />
      <path d="M12 8v4.3l2.8 1.8" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...duo} />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M6.6 7.4C4 9.2 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.5-.6 4.9-1.5M10 5.7c.6-.1 1.3-.2 2-.2 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.2" {...duo} />
      <path d="M4 4l16 16" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6.5" r="1.4" {...dot} />
      <circle cx="15" cy="6.5" r="1.4" {...dot} />
      <circle cx="9" cy="12" r="1.4" {...dot} />
      <circle cx="15" cy="12" r="1.4" {...dot} />
      <circle cx="9" cy="17.5" r="1.4" {...dot} />
      <circle cx="15" cy="17.5" r="1.4" {...dot} />
    </>
  ),
  rocket: (
    <>
      <path d="M14.5 4.5c3-1 5-1 5-1s0 2-1 5l-5.5 5.5-3-3z" {...duo} />
      <path d="M10 10.5 6.5 10l-2 2 4 1.5M13.5 14l.5 3.5-2 2-1.5-4" />
      <path d="M6 18c-1 .4-1.5 1-1.5 1.5.5 0 1.1-.5 1.5-1.5z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof glyphs;

export const ICON_NAMES = Object.keys(glyphs) as IconName[];

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyphs[name]}
    </svg>
  );
}
