import { validateSchema } from '@nebula/link';
import { dockBounds, dockPayload, isRect, samePayload, supportsDock } from './dock';

const CONTENT = { x: 100, y: 50, width: 1280, height: 860 };

describe('dock geometry', () => {
  it('turns the content-relative area into screen coordinates, rounded and kept inside', () => {
    expect(dockBounds(CONTENT, { x: 236.4, y: 0, width: 1043.6, height: 860 })).toEqual({ x: 336, y: 50, width: 1044, height: 860 });
    expect(dockBounds(CONTENT, { x: 236, y: 0, width: 5000, height: 5000 })).toEqual({ x: 336, y: 50, width: 1044, height: 860 });
    expect(dockBounds(CONTENT, { x: -40, y: -10, width: 200, height: 200 })).toEqual({ x: 100, y: 50, width: 200, height: 200 });
  });

  it('hides the app when the Hub is hidden, on another screen, or the area is too small', () => {
    expect(dockPayload(null, { x: 0, y: 0, width: 800, height: 600 }, true)).toMatchObject({ state: 'docked', visible: false, raise: false });
    expect(dockPayload(CONTENT, null, true)).toMatchObject({ visible: false });
    expect(dockPayload(CONTENT, { x: 0, y: 0, width: 80, height: 600 }, true)).toMatchObject({ visible: false, raise: false });
    expect(dockPayload(CONTENT, { x: 236, y: 0, width: 1044, height: 860 }, true)).toEqual({ state: 'docked', visible: true, raise: true, bounds: { x: 336, y: 50, width: 1044, height: 860 } });
  });

  it('produces payloads that pass the DockV1 schema of the SDK', () => {
    expect(validateSchema('DockV1', dockPayload(CONTENT, { x: 236, y: 0, width: 1044, height: 860 }, false))).toBe(true);
    expect(validateSchema('DockV1', dockPayload(null, null, false))).toBe(true);
    expect(validateSchema('DockV1', { state: 'released' })).toBe(true);
    expect(validateSchema('DockV1', { state: 'released', extra: 1 })).toBe(false);
    expect(validateSchema('DockV1', { state: 'docked', visible: true, raise: false, bounds: { x: 1.5, y: 0, width: 10, height: 10 } })).toBe(false);
  });

  it('validates rectangles from the renderer', () => {
    expect(isRect({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(isRect({ x: 0, y: 0, width: -1, height: 10 })).toBe(false);
    expect(isRect({ x: Number.NaN, y: 0, width: 1, height: 1 })).toBe(false);
    expect(isRect({ x: 0, y: 0, width: 1e9, height: 1 })).toBe(false);
    expect(isRect('rect')).toBe(false);
  });

  it('knows which apps support the Hub mode and when nothing changed', () => {
    expect(supportsDock({ consumes: [{ id: 'nebula.appearance.changed' }, { id: 'nebula.hub.dock' }] })).toBe(true);
    expect(supportsDock({ consumes: [] })).toBe(false);
    expect(samePayload({ state: 'released' }, { state: 'released' })).toBe(true);
    expect(samePayload(undefined, { state: 'released' })).toBe(false);
  });
});
