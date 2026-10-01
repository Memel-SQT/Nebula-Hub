import { useEffect } from 'react';
import type { MotionLevel } from './appearance';
import { playSound, SOUND_NAMES, type SoundName } from './sound';
import { isGlassTheme, type ResolvedTheme } from './theme';

/**
 * Interface-wide feedback, attached once at the document level (capture phase) instead of in
 * every component:
 * - a click sound on every button, chosen by its `data-sound` attribute (`tap` by default,
 *   `none` to opt out where the action plays its own success/delete sound once it completes);
 * - a ripple from the click point (full motion only, never on a keyboard click, and not on
 *   elements marked `data-no-ripple`);
 * - in the glass themes, a soft light that follows the pointer across the hovered surface.
 *
 * Ported from Nebula Finterest v0.1.36 `src/renderer/effects.ts`. Differences: the glass
 * surface selector is a parameter (each app lists its own panels), and Finterest's hard-coded
 * `.account-tile` ripple exclusion became the generic `data-no-ripple` attribute.
 */
export function useInterfaceEffects(motion: MotionLevel, theme: ResolvedTheme, glassSurfaces: string): void {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('button');
      if (!button || button.disabled) {
        return;
      }
      const requested = button.dataset.sound;
      if (requested !== 'none') {
        playSound(SOUND_NAMES.includes(requested as SoundName) ? (requested as SoundName) : 'tap');
      }
      if (motion === 'full' && !button.hasAttribute('data-no-ripple') && event.detail > 0) {
        spawnRipple(button, event);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [motion]);

  useEffect(() => {
    if (!isGlassTheme(theme) || motion !== 'full') {
      return;
    }
    let frame = 0;
    let lastEvent: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const event = lastEvent;
      const surface = (event?.target as Element | null)?.closest?.(glassSurfaces) as HTMLElement | null;
      if (!event || !surface) {
        return;
      }
      const bounds = surface.getBoundingClientRect();
      surface.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
      surface.style.setProperty('--my', `${event.clientY - bounds.top}px`);
    };
    const onMove = (event: PointerEvent) => {
      lastEvent = event;
      if (!frame) {
        frame = window.requestAnimationFrame(apply);
      }
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      window.cancelAnimationFrame(frame);
    };
  }, [theme, motion, glassSurfaces]);
}

/** Also used directly for a tile-sized wave (app launch, brief §10.3). */
export function spawnRipple(element: HTMLElement, event: { clientX: number; clientY: number }): void {
  const bounds = element.getBoundingClientRect();
  const size = Math.max(bounds.width, bounds.height) * 2.2;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - bounds.left - size / 2}px`;
  ripple.style.top = `${event.clientY - bounds.top - size / 2}px`;
  element.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  // Safety net if the animation never runs (element detached, animations disabled).
  window.setTimeout(() => ripple.remove(), 900);
}
