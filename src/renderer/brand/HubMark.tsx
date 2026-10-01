import { createElement, useId } from 'react';
import { CURRENT_MARK, MARK_COLORS, resolveShapes, type MarkVariant } from './marks';

/** SVG attribute names → React prop names (only those used by the marks). */
const REACT_ATTRS: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
};

/**
 * The Nebula Hub mark. `animated` adds the splash choreography classes (see
 * `@nebula/design/styles/splash.css`); otherwise it is a static logo.
 */
export function HubMark({ variant = CURRENT_MARK, animated = false, size, title, className }: { variant?: MarkVariant; animated?: boolean; size?: number; title?: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const ids = { gradient: `hub-gradient-${id}`, halo: `hub-halo-${id}`, spark: `hub-spark-${id}` };

  return (
    <svg
      className={[animated ? 'splash-mark' : 'hub-mark', className].filter(Boolean).join(' ')}
      viewBox="0 0 128 128"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={ids.gradient} x1="16" y1="16" x2="112" y2="112" gradientUnits="userSpaceOnUse">
          <stop stopColor={MARK_COLORS.from} />
          <stop offset="1" stopColor={MARK_COLORS.to} />
        </linearGradient>
        <radialGradient id={ids.halo} cx="0.5" cy="0.32" r="0.78">
          <stop stopColor={MARK_COLORS.halo} stopOpacity="0.42" />
          <stop offset="1" stopColor={MARK_COLORS.halo} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.spark}>
          <stop stopColor={MARK_COLORS.spark} stopOpacity="0.55" />
          <stop offset="1" stopColor={MARK_COLORS.spark} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect className={animated ? 'splash-mark-plate' : undefined} width="128" height="128" rx="30" fill={MARK_COLORS.plate} />
      <rect className={animated ? 'splash-mark-halo' : undefined} width="128" height="128" rx="30" fill={`url(#${ids.halo})`} />
      {resolveShapes(variant, ids, animated, !animated && size !== undefined && size <= 32).map((shape, index) => {
        const props: Record<string, unknown> = { key: index, className: shape.className };
        for (const [name, value] of Object.entries(shape.attrs)) {
          props[REACT_ATTRS[name] ?? name] = value;
        }
        if (shape.origin) props.style = { transformOrigin: `${shape.origin[0]}px ${shape.origin[1]}px` };
        return createElement(shape.tag, props);
      })}
    </svg>
  );
}
