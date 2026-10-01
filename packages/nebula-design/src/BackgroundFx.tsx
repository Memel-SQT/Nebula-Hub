import { useEffect, useRef } from 'react';
import type { BackgroundEffect, MotionLevel } from './appearance';

/**
 * Ambient background painted behind every screen. `glow` and `aurora` are pure CSS; the
 * others draw on a canvas. All of them read their colors from the live CSS variables, so they
 * follow the theme and the custom accent, and they only ever animate when motion is `full`
 * (otherwise a single still frame is drawn). The loop stops while the document is hidden.
 *
 * Ported from Nebula Finterest v0.1.36 `src/renderer/components/BackgroundFx.tsx`; the three
 * painters are unchanged. Addition: `paused`, driven by the host app, because an app that
 * lives in the tray must stop the loop whenever its window is minimized or hidden, which
 * `document.hidden` does not always report. A frame counter (`backgroundFrameCount`) lets the
 * app prove it in a diagnostic (brief §17, M1).
 */
export function BackgroundFx({ effect, motion, paused = false }: { effect: BackgroundEffect; motion: MotionLevel; paused?: boolean }) {
  if (effect === 'none') {
    return null;
  }
  if (effect === 'glow') {
    return <div className="bg-glow" aria-hidden="true" />;
  }
  if (effect === 'aurora') {
    return (
      <div className="bg-aurora" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
    );
  }
  return <CanvasFx effect={effect} motion={motion} paused={paused} />;
}

let frameCount = 0;

/** Total canvas frames painted since startup; constant while the loop is stopped. */
export function backgroundFrameCount(): number {
  return frameCount;
}

interface Palette {
  accent: string;
  secondary: string;
  ink: string;
  dark: boolean;
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    accent: read('--accent', '#8b5cf6'),
    secondary: read('--gold', '#4c6ef5'),
    ink: read('--ink', '#f1f1f6'),
    dark: styles.colorScheme !== 'light',
  };
}

/** Accepts `#rrggbb` or `rgb(...)`; returns an `rgba()` string at the given alpha. */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const value = parseInt(color.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const [r, g, b] = match[1].split(',').map((part) => part.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

type Painter = (context: CanvasRenderingContext2D, width: number, height: number, time: number, palette: Palette) => void;

interface Star { x: number; y: number; depth: number; radius: number; phase: number }
interface Particle { x: number; y: number; vx: number; vy: number; radius: number; tint: number }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number }

function createStars(width: number, height: number): Painter {
  const count = Math.round((width * height) / 5200);
  const stars: Star[] = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    depth: 0.25 + Math.random() * 0.75,
    radius: 0.35 + Math.random() * 1.15,
    phase: Math.random() * Math.PI * 2,
  }));
  let meteor: Meteor | null = null;
  let nextMeteorAt = 4000 + Math.random() * 6000;
  let lastTime = 0;

  return (context, w, h, time, palette) => {
    const delta = lastTime ? Math.min(64, time - lastTime) : 16;
    lastTime = time;
    context.clearRect(0, 0, w, h);
    for (const star of stars) {
      star.x -= 0.012 * star.depth * delta;
      if (star.x < -2) {
        star.x = w + 2;
        star.y = Math.random() * h;
      }
      const twinkle = 0.55 + 0.45 * Math.sin(time / 900 + star.phase);
      const alpha = (palette.dark ? 0.85 : 0.5) * star.depth * twinkle;
      context.beginPath();
      context.fillStyle = palette.dark ? withAlpha(star.depth > 0.8 ? palette.accent : '#ffffff', alpha) : withAlpha(palette.accent, alpha);
      context.arc(star.x, star.y, star.radius * star.depth + 0.2, 0, Math.PI * 2);
      context.fill();
    }

    if (!meteor && time > nextMeteorAt) {
      meteor = { x: w * (0.3 + Math.random() * 0.7), y: -20, vx: -0.55, vy: 0.32, life: 1 };
      nextMeteorAt = time + 7000 + Math.random() * 9000;
    }
    if (meteor) {
      meteor.x += meteor.vx * delta;
      meteor.y += meteor.vy * delta;
      meteor.life -= 0.0009 * delta;
      const tail = context.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * 220, meteor.y - meteor.vy * 220);
      tail.addColorStop(0, withAlpha(palette.dark ? '#ffffff' : palette.accent, 0.8 * meteor.life));
      tail.addColorStop(1, withAlpha(palette.secondary, 0));
      context.strokeStyle = tail;
      context.lineWidth = 1.6;
      context.beginPath();
      context.moveTo(meteor.x, meteor.y);
      context.lineTo(meteor.x - meteor.vx * 220, meteor.y - meteor.vy * 220);
      context.stroke();
      if (meteor.life <= 0 || meteor.y > h + 40) {
        meteor = null;
      }
    }
  };
}

function createParticles(width: number, height: number, pointer: { x: number; y: number }): Painter {
  const count = Math.min(110, Math.round((width * height) / 15000));
  const particles: Particle[] = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.02,
    vy: (Math.random() - 0.5) * 0.02,
    radius: 1 + Math.random() * 1.8,
    tint: Math.random(),
  }));
  const linkDistance = 130;
  let lastTime = 0;

  return (context, w, h, time, palette) => {
    const delta = lastTime ? Math.min(64, time - lastTime) : 16;
    lastTime = time;
    context.clearRect(0, 0, w, h);
    for (const particle of particles) {
      const dx = pointer.x - particle.x;
      const dy = pointer.y - particle.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 180 && distance > 1) {
        // A light pull toward the cursor, so the field reacts without chasing it.
        particle.vx += (dx / distance) * 0.00004 * delta;
        particle.vy += (dy / distance) * 0.00004 * delta;
      }
      particle.vx *= 0.995;
      particle.vy *= 0.995;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      if (particle.x < -10) particle.x = w + 10;
      if (particle.x > w + 10) particle.x = -10;
      if (particle.y < -10) particle.y = h + 10;
      if (particle.y > h + 10) particle.y = -10;
    }

    const lineAlpha = palette.dark ? 0.22 : 0.16;
    context.lineWidth = 1;
    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const a = particles[i];
        const b = particles[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < linkDistance) {
          context.strokeStyle = withAlpha(palette.accent, lineAlpha * (1 - distance / linkDistance));
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }
    }
    for (const particle of particles) {
      context.beginPath();
      context.fillStyle = withAlpha(particle.tint > 0.5 ? palette.accent : palette.secondary, palette.dark ? 0.75 : 0.5);
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }
  };
}

function createWaves(): Painter {
  const layers = [
    { amplitude: 34, length: 0.0042, speed: 0.00025, offset: 0.62, alpha: 0.2, useAccent: false },
    { amplitude: 26, length: 0.0058, speed: -0.00034, offset: 0.7, alpha: 0.18, useAccent: true },
    { amplitude: 20, length: 0.0075, speed: 0.00045, offset: 0.78, alpha: 0.16, useAccent: false },
  ];
  return (context, w, h, time, palette) => {
    context.clearRect(0, 0, w, h);
    for (const layer of layers) {
      const color = layer.useAccent ? palette.accent : palette.secondary;
      const gradient = context.createLinearGradient(0, h * layer.offset - layer.amplitude, 0, h);
      gradient.addColorStop(0, withAlpha(color, layer.alpha * (palette.dark ? 1.2 : 0.8)));
      gradient.addColorStop(1, withAlpha(color, 0));
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(0, h);
      for (let x = 0; x <= w + 8; x += 8) {
        const y = h * layer.offset
          + Math.sin(x * layer.length + time * layer.speed) * layer.amplitude
          + Math.sin(x * layer.length * 2.3 - time * layer.speed * 1.7) * layer.amplitude * 0.35;
        context.lineTo(x, y);
      }
      context.lineTo(w, h);
      context.closePath();
      context.fill();
    }
  };
}

function CanvasFx({ effect, motion, paused }: { effect: Exclude<BackgroundEffect, 'none' | 'glow' | 'aurora'>; motion: MotionLevel; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = motion === 'full' && !systemReduced;
    const pointer = { x: -9999, y: -9999 };
    let palette = readPalette();
    let painter: Painter;
    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      painter = effect === 'stars' ? createStars(width, height) : effect === 'particles' ? createParticles(width, height, pointer) : createWaves();
      if (!animate) {
        painter(context, width, height, 12_000, palette);
      }
    };

    const loop = (time: number) => {
      painter(context, width, height, time, palette);
      frameCount += 1;
      frame = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (animate && !frame && !document.hidden && !paused) {
        frame = window.requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onPointer = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    // Theme or accent changes rewrite attributes on <html>; re-read the colors when they do.
    const observer = new MutationObserver(() => {
      palette = readPalette();
      if (!animate) {
        painter(context, width, height, 12_000, palette);
      }
    });

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointermove', onPointer, { passive: true });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [effect, motion, paused]);

  return <canvas ref={canvasRef} className="bg-canvas" aria-hidden="true" />;
}
