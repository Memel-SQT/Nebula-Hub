/**
 * Renders the Nebula Hub marks (src/renderer/brand/marks.ts) to files:
 * - docs/logo/: the three proposals as SVG, PNG previews at 16/32/256 px, and proposals.html
 *   (animated splash of each variant + small-size renders) for the logo choice;
 * - the app icons from the current mark: assets/app-icon.svg, assets/icon.png,
 *   assets/tray-dark.png / tray-light.png (+ @2x: monochrome glyphs for a dark / light Windows
 *   taskbar), build/icon.png (1024 px) and build/icon.ico (16 → 256 px, the optical small
 *   variant up to 32 px).
 *
 * Same method as Nebula Finterest (session #42): @resvg/resvg-js + png-to-ico, which are not
 * project dependencies. Install them in a throwaway folder and point ICONKIT_DIR at it:
 *   npm i --prefix <dir> @resvg/resvg-js png-to-ico
 *   ICONKIT_DIR=<dir> npx ts-node --transpile-only -O "{\"module\":\"commonjs\"}" scripts/render-logos.ts
 * (the recent png-to-ico exports its function on `.default`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { CURRENT_MARK, MARKS, markToSvg, monoMarkToSvg, type MarkVariant } from '../src/renderer/brand/marks';

const kit = process.env.ICONKIT_DIR;
if (!kit) {
  throw new Error('Set ICONKIT_DIR to a folder where @resvg/resvg-js and png-to-ico are installed.');
}
const kitRequire = (name: string) => require(require.resolve(name, { paths: [kit] }));
const { Resvg } = kitRequire('@resvg/resvg-js') as { Resvg: new (svg: string, options: unknown) => { render(): { asPng(): Buffer } } };
const pngToIcoModule = kitRequire('png-to-ico') as { default?: (input: Buffer[]) => Promise<Buffer> } & ((input: Buffer[]) => Promise<Buffer>);
const pngToIco = pngToIcoModule.default ?? pngToIcoModule;

const root = path.join(__dirname, '..');
const out = (...parts: string[]) => {
  const file = path.join(root, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
};

function png(svg: string, size: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render().asPng();
}

const VARIANTS = Object.keys(MARKS) as MarkVariant[];
const PREVIEW_SIZES = [16, 32, 256];

async function main(): Promise<void> {
  // 1. Proposals.
  const previews: Record<string, Record<number, string>> = {};
  for (const variant of VARIANTS) {
    const svg = markToSvg(variant, { title: `Nebula Hub — ${MARKS[variant].name.fr}` });
    fs.writeFileSync(out('docs', 'logo', `hub-mark-${variant}.svg`), `${svg}\n`);
    previews[variant] = {};
    for (const size of PREVIEW_SIZES) {
      const buffer = png(svg, size);
      fs.writeFileSync(out('docs', 'logo', 'png', `hub-mark-${variant}-${size}.png`), buffer);
      previews[variant][size] = buffer.toString('base64');
    }
  }
  fs.writeFileSync(out('docs', 'logo', 'proposals.html'), proposalsPage(previews));

  // 2. App icons from the current mark.
  const current = markToSvg(CURRENT_MARK, { title: 'Nebula Hub' });
  fs.writeFileSync(out('assets', 'app-icon.svg'), `${current}\n`);
  fs.writeFileSync(out('assets', 'icon.png'), png(current, 512));
  fs.writeFileSync(out('build', 'icon.png'), png(current, 1024));
  const currentSmall = markToSvg(CURRENT_MARK, { title: 'Nebula Hub', small: true });
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  fs.writeFileSync(out('build', 'icon.ico'), await pngToIco(icoSizes.map((size) => png(size <= 32 ? currentSmall : current, size))));
  for (const [file, color] of [['tray-dark', '#ffffff'], ['tray-light', '#1b1a2e']] as const) {
    const glyph = monoMarkToSvg(CURRENT_MARK, color);
    fs.writeFileSync(out('assets', `${file}.png`), png(glyph, 16));
    fs.writeFileSync(out('assets', `${file}@2x.png`), png(glyph, 32));
  }
  fs.writeFileSync(out('docs', 'logo', 'png', `hub-mark-${CURRENT_MARK}-small-32.png`), png(currentSmall, 32));
  console.log(`Rendered proposals ${VARIANTS.join(', ')} and app icons from mark "${CURRENT_MARK}".`);
}

function proposalsPage(previews: Record<string, Record<number, string>>): string {
  const splashCss = fs.readFileSync(path.join(root, 'packages', 'nebula-design', 'src', 'styles', 'splash.css'), 'utf8');
  const cards = VARIANTS.map((variant) => {
    const mark = MARKS[variant];
    const animated = markToSvg(variant, { animated: true, idPrefix: `p-${variant}`, title: mark.name.fr });
    const sizes = PREVIEW_SIZES.map((size) => `
        <figure><img src="data:image/png;base64,${previews[variant][size]}" width="${size}" height="${size}" alt="${mark.name.fr}, ${size} px"><figcaption>${size} px</figcaption></figure>`).join('');
    const zoomed = [16, 32].map((size) => `
        <figure><img class="zoom" src="data:image/png;base64,${previews[variant][size]}" width="${size * 4}" height="${size * 4}" alt="${mark.name.fr}, ${size} px agrandi"><figcaption>${size} px ×4</figcaption></figure>`).join('');
    return `
    <article class="card">
      <h2>${mark.name.fr}</h2>
      <p>${mark.idea.fr}</p>
      <div class="stage" data-variant="${variant}">
        <div class="splash-demo">${animated}
          <div class="splash-text"><strong>Nebula Hub</strong><span>Toutes vos apps Nebula, au même endroit</span></div>
          <div class="splash-progress" aria-hidden="true"><i></i></div>
        </div>
      </div>
      <button type="button" class="replay" data-variant="${variant}">Rejouer l’ouverture</button>
      <div class="sizes">${sizes}</div>
      <div class="sizes">${zoomed}</div>
    </article>`;
  }).join('');

  return `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Logo Nebula Hub</title>
<style>
  :root { --ease: cubic-bezier(0.4, 0, 0.2, 1); --ease-out: cubic-bezier(0.16, 1, 0.3, 1); --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); --motion-slow: 420ms;
    --page: #0a0a0f; --surface: #1a1a2e; --surface-raised: #231942; --line: #2a2a45; --ink: #f1f1f6; --muted: #9a94b8; --accent: #8b5cf6; --gold: #4c6ef5;
    --accent-glow: rgba(139, 92, 246, 0.24); --accent-gradient: linear-gradient(100deg, var(--gold), var(--accent)); }
  :root[data-theme='light'] { --page: #f4f3fb; --surface: #ffffff; --surface-raised: #ece9f9; --line: #ddd9ef; --ink: #18172b; --muted: #6b6584; --accent: #7c3aed; --gold: #3b5bdb; --accent-glow: rgba(124, 58, 237, 0.16); }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2rem 1rem 4rem; background: var(--page); color: var(--ink); font-family: 'Aptos', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif; line-height: 1.5; }
  header { max-width: 1200px; margin: 0 auto 1.5rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: end; justify-content: space-between; }
  h1 { margin: 0; font-size: 1.8rem; letter-spacing: -0.03em; } header p { margin: 0.3rem 0 0; color: var(--muted); }
  .grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
  .card { padding: 1.3rem; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
  .card h2 { margin: 0; font-size: 1.1rem; } .card > p { min-height: 4.5em; color: var(--muted); font-size: 0.85rem; }
  .stage { display: grid; place-items: center; height: 300px; border-radius: 14px; background: radial-gradient(400px 260px at 20% 15%, rgba(76, 110, 245, 0.16), transparent 60%), radial-gradient(420px 300px at 85% 85%, rgba(139, 92, 246, 0.14), transparent 60%), var(--page); overflow: hidden; }
  .splash-demo { display: grid; justify-items: center; gap: 1.2rem; }
  button { margin: 0.8rem 0; padding: 0.55rem 0.9rem; border: 0; border-radius: 12px; background: var(--accent-gradient); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  .sizes { display: flex; flex-wrap: wrap; gap: 1rem; align-items: end; margin-top: 0.6rem; }
  figure { margin: 0; text-align: center; } figcaption { color: var(--muted); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
  .zoom { image-rendering: pixelated; }
  ${splashCss}
  .splash-mark { width: 116px; height: 116px; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; } }
</style>
</head>
<body>
<header>
  <div><h1>Nebula Hub — trois propositions de logo</h1><p>Ouverture animée (2,4 s, même chorégraphie que Nebula Finterest) et rendus à 16, 32 et 256 px.</p></div>
  <button type="button" class="ghost" id="theme">Fond clair / sombre</button>
</header>
<main class="grid">${cards}
</main>
<script>
  document.getElementById('theme').addEventListener('click', () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
  });
  for (const button of document.querySelectorAll('.replay')) {
    button.addEventListener('click', () => {
      const stage = document.querySelector('.stage[data-variant="' + button.dataset.variant + '"]');
      const demo = stage.firstElementChild;
      const copy = demo.cloneNode(true);
      demo.replaceWith(copy);
    });
  }
</script>
</body>
</html>
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
