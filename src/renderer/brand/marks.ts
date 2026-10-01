/**
 * The three Nebula Hub logo proposals (brief §10.6), as pure data so the very same geometry
 * feeds the React mark (splash, sidebar) and `scripts/render-logos.ts` (SVG, PNG, ICO).
 *
 * Family grammar (nebula-design-system, Finterest mark): 128×128 viewBox, plate rx 30 in
 * #12121F, radial halo #8B5CF6 at 42 %, #4C6EF5 → #A855F7 gradient, a single solid accent
 * (#A855F7, the star), inner margin ≥ 18/128. Every mark is built for the splash
 * choreography: one stroke to draw (`draw`), three tiles that pop one by one (`tile`), and the
 * star last (`star`, with its `glow`). `dust` is the faint star dust on the plate.
 */
export type MarkVariant = 'a' | 'b' | 'c';

export type MarkRole = 'dust' | 'draw' | 'tile' | 'glow' | 'star';

export interface MarkShape {
  role: MarkRole;
  tag: 'rect' | 'path' | 'ellipse' | 'circle';
  attrs: Record<string, string | number>;
  /** Gradient fill or stroke for draw/tiles; the star is the solid accent, glow and dust have their own paint. */
  paint: 'fill' | 'stroke';
  /** Scale origin for tiles, glow and star, in viewBox units. */
  origin?: [number, number];
}

export interface MarkDefinition {
  id: MarkVariant;
  name: { fr: string; en: string };
  idea: { fr: string; en: string };
  shapes: MarkShape[];
}

export const MARK_COLORS = {
  plate: '#12121F',
  halo: '#8B5CF6',
  from: '#4C6EF5',
  to: '#A855F7',
  star: '#A855F7',
  spark: '#C4A1FF',
  dust: '#FFFFFF',
} as const;

/** Four-pointed star centered on (cx, cy), with slightly concave sides. */
function star(cx: number, cy: number, r: number): string {
  const k = r * 0.18;
  return `M${cx} ${cy - r}C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy}C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r}C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy}C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

function dust(points: Array<[number, number, number, number]>): MarkShape[] {
  return points.map(([cx, cy, r, opacity]) => ({ role: 'dust', tag: 'circle', paint: 'fill', attrs: { cx, cy, r, opacity } }));
}

function starWithGlow(cx: number, cy: number, r: number): MarkShape[] {
  return [
    { role: 'glow', tag: 'circle', paint: 'fill', origin: [cx, cy], attrs: { cx, cy, r: r * 1.55 } },
    { role: 'star', tag: 'path', paint: 'fill', origin: [cx, cy], attrs: { d: star(cx, cy, r) } },
  ];
}

export const MARKS: Record<MarkVariant, MarkDefinition> = {
  a: {
    id: 'a',
    name: { fr: 'A — Constellation', en: 'A — Constellation' },
    idea: {
      fr: 'Grille 2×2 de tuiles pleines, la quatrième devenue étoile lumineuse, dans un cadre tracé. La plus lisible à 16 px.',
      en: 'A 2×2 grid of solid tiles, the fourth turned into a glowing star, inside a drawn frame. The most legible at 16 px.',
    },
    shapes: [
      ...dust([[24, 104, 1.3, 0.35], [104, 24, 1.1, 0.3], [108, 100, 0.9, 0.25]]),
      { role: 'draw', tag: 'rect', paint: 'stroke', attrs: { x: 20, y: 20, width: 88, height: 88, rx: 25, 'stroke-width': 3.5, opacity: 0.55 } },
      { role: 'tile', tag: 'rect', paint: 'fill', origin: [44, 44], attrs: { x: 30, y: 30, width: 28, height: 28, rx: 9 } },
      { role: 'tile', tag: 'rect', paint: 'fill', origin: [44, 84], attrs: { x: 30, y: 70, width: 28, height: 28, rx: 9, opacity: 0.85 } },
      { role: 'tile', tag: 'rect', paint: 'fill', origin: [84, 84], attrs: { x: 70, y: 70, width: 28, height: 28, rx: 9, opacity: 0.7 } },
      ...starWithGlow(84, 44, 17),
    ],
  },
  b: {
    id: 'b',
    name: { fr: 'B — Orbite', en: 'B — Orbit' },
    idea: {
      fr: 'Trois tuiles en contour et l’étoile, traversées par l’orbite de la famille (celle de Finterest). Plus aérien, moins dense en petit.',
      en: 'Three outlined tiles and the star, crossed by the family orbit (Finterest’s). Airier, less dense when small.',
    },
    shapes: [
      ...dust([[22, 30, 1.2, 0.35], [106, 106, 1.2, 0.3], [24, 108, 0.9, 0.25]]),
      { role: 'draw', tag: 'ellipse', paint: 'stroke', attrs: { cx: 64, cy: 64, rx: 51, ry: 19, transform: 'rotate(-30 64 64)', 'stroke-width': 5, opacity: 0.55 } },
      { role: 'tile', tag: 'rect', paint: 'stroke', origin: [45, 45], attrs: { x: 34, y: 34, width: 22, height: 22, rx: 7, 'stroke-width': 7 } },
      { role: 'tile', tag: 'rect', paint: 'stroke', origin: [45, 83], attrs: { x: 34, y: 72, width: 22, height: 22, rx: 7, 'stroke-width': 7 } },
      { role: 'tile', tag: 'rect', paint: 'stroke', origin: [83, 83], attrs: { x: 72, y: 72, width: 22, height: 22, rx: 7, 'stroke-width': 7 } },
      ...starWithGlow(83, 45, 18),
    ],
  },
  c: {
    id: 'c',
    name: { fr: 'C — Lien', en: 'C — Link' },
    idea: {
      fr: 'Trois tuiles reliées à l’étoile par les traits d’une constellation : les apps qui se parlent (Nebula Link).',
      en: 'Three tiles joined to the star by constellation lines: apps that talk to each other (Nebula Link).',
    },
    shapes: [
      ...dust([[106, 102, 1.3, 0.35], [22, 26, 1.1, 0.3], [64, 108, 0.9, 0.25]]),
      { role: 'draw', tag: 'path', paint: 'stroke', attrs: { d: 'M42 88L46 46L88 40M46 46L86 84', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.6 } },
      { role: 'tile', tag: 'rect', paint: 'fill', origin: [42, 88], attrs: { x: 29, y: 75, width: 26, height: 26, rx: 8.5 } },
      { role: 'tile', tag: 'rect', paint: 'fill', origin: [46, 46], attrs: { x: 34, y: 34, width: 24, height: 24, rx: 8, opacity: 0.9 } },
      { role: 'tile', tag: 'rect', paint: 'fill', origin: [86, 84], attrs: { x: 74, y: 72, width: 24, height: 24, rx: 8, opacity: 0.75 } },
      ...starWithGlow(88, 40, 16),
    ],
  },
};

/** The mark used by the app until the final choice (STOP of M1). */
export const CURRENT_MARK: MarkVariant = 'a';

export interface ResolvedShape {
  tag: MarkShape['tag'];
  attrs: Record<string, string | number>;
  className?: string;
  origin?: [number, number];
}

/** Paint and animation classes for every shape, shared by the SVG writer and the React mark. */
export function resolveShapes(variant: MarkVariant, ids: { gradient: string; spark: string }, animated: boolean): ResolvedShape[] {
  let tileIndex = 0;
  return MARKS[variant].shapes.map((shape) => {
    const attrs: Record<string, string | number> = { ...shape.attrs };
    if (shape.role === 'star') {
      attrs.fill = MARK_COLORS.star;
    } else if (shape.role === 'glow') {
      attrs.fill = `url(#${ids.spark})`;
    } else if (shape.role === 'dust') {
      attrs.fill = MARK_COLORS.dust;
    } else if (shape.paint === 'fill') {
      attrs.fill = `url(#${ids.gradient})`;
    } else {
      attrs.fill = 'none';
      attrs.stroke = `url(#${ids.gradient})`;
    }
    let className: string | undefined;
    if (animated) {
      className = {
        dust: 'splash-mark-dust',
        draw: 'splash-mark-draw',
        glow: 'splash-mark-star',
        star: 'splash-mark-star',
        tile: '',
      }[shape.role] || `splash-mark-tile-${(tileIndex += 1)}`;
      if (shape.role === 'draw') attrs.pathLength = 100;
    }
    return { tag: shape.tag, attrs, className, origin: animated ? shape.origin : undefined };
  });
}

/**
 * Standalone SVG string (for files, icons and previews). `animated` adds the splash classes;
 * `idPrefix` keeps gradient ids unique when several marks share a page.
 */
export function markToSvg(variant: MarkVariant, options: { animated?: boolean; idPrefix?: string; title?: string } = {}): string {
  const prefix = options.idPrefix ?? `hub-${variant}`;
  const ids = { gradient: `${prefix}-gradient`, halo: `${prefix}-halo`, spark: `${prefix}-spark` };
  const shapes = resolveShapes(variant, ids, Boolean(options.animated)).map(({ tag, attrs, className, origin }) => {
    const all: Record<string, string | number> = { ...attrs };
    if (className) all.class = className;
    if (origin) all.style = `transform-origin: ${origin[0]}px ${origin[1]}px`;
    return `  <${tag} ${Object.entries(all).map(([name, value]) => `${name}="${value}"`).join(' ')}/>`;
  });
  const plateClass = options.animated ? ' class="splash-mark-plate"' : '';
  const haloClass = options.animated ? ' class="splash-mark-halo"' : '';
  const title = options.title ? `\n  <title>${options.title}</title>` : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"${options.animated ? ' class="splash-mark"' : ''} role="img">${title}`,
    '  <defs>',
    `    <linearGradient id="${ids.gradient}" x1="16" y1="16" x2="112" y2="112" gradientUnits="userSpaceOnUse"><stop stop-color="${MARK_COLORS.from}"/><stop offset="1" stop-color="${MARK_COLORS.to}"/></linearGradient>`,
    `    <radialGradient id="${ids.halo}" cx="0.5" cy="0.32" r="0.78"><stop stop-color="${MARK_COLORS.halo}" stop-opacity="0.42"/><stop offset="1" stop-color="${MARK_COLORS.halo}" stop-opacity="0"/></radialGradient>`,
    `    <radialGradient id="${ids.spark}"><stop stop-color="${MARK_COLORS.spark}" stop-opacity="0.55"/><stop offset="1" stop-color="${MARK_COLORS.spark}" stop-opacity="0"/></radialGradient>`,
    '  </defs>',
    `  <rect width="128" height="128" rx="30" fill="${MARK_COLORS.plate}"${plateClass}/>`,
    `  <rect width="128" height="128" rx="30" fill="url(#${ids.halo})"${haloClass}/>`,
    ...shapes,
    '</svg>',
  ].join('\n');
}
