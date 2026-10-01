import { useEffect, useState, type ReactNode } from 'react';
import type { MotionLevel } from './appearance';

/**
 * Opening sequence, generalized from Nebula Finterest v0.1.36
 * `src/renderer/components/SplashScreen.tsx` (same 2 400 ms choreography, same timings):
 * plate scale-in → breathing halo → stroke-drawn first element → staggered tiles → spring
 * star → wordmark → sweeping progress bar → fade-out at 1.04 scale.
 *
 * The mark itself is passed in by the app: its SVG uses the `splash-mark-*` classes defined
 * in `styles/splash.css` (`-plate`, `-halo`, `-draw`, `-tile-1..3`, `-star`). Tiles and star
 * scale from viewBox coordinates, so each one must set its own `transform-origin` (in viewBox
 * units, with `transform-box: view-box`), or they grow from the wrong point.
 */
export const SPLASH_DURATION_MS = 2400;
export const SPLASH_DURATION_REDUCED_MS = 250;
export const SPLASH_FADE_MS = 380;

export function Splash({ title, tagline, mark, motion, onFinish }: { title: string; tagline: string; mark: ReactNode; motion: MotionLevel; onFinish: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduced = motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? SPLASH_DURATION_REDUCED_MS : SPLASH_DURATION_MS;
    const leaveTimer = window.setTimeout(() => setLeaving(true), duration);
    const finishTimer = window.setTimeout(onFinish, duration + (reduced ? 0 : SPLASH_FADE_MS));
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(finishTimer);
    };
  }, [onFinish, motion]);

  return (
    <main className={`splash-screen ${leaving ? 'splash-leaving' : ''}`} aria-label={title}>
      {mark}
      <div className="splash-text">
        <strong>{title}</strong>
        <span>{tagline}</span>
      </div>
      <div className="splash-progress" aria-hidden="true"><i /></div>
    </main>
  );
}
