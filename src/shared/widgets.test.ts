import { moveWidget, orderWidgets, placeWidget, refreshInterval, widgetStateOf } from './widgets';

const cards = (...ids: string[]) => ids.map((id) => ({ id }));

describe('orderWidgets', () => {
  it('follows the saved order and puts new widgets at the end, in arrival order', () => {
    expect(orderWidgets(cards('a', 'b', 'c', 'd'), ['c', 'a']).map((card) => card.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignores ids of widgets that are gone', () => {
    expect(orderWidgets(cards('a', 'b'), ['x', 'b', 'y']).map((card) => card.id)).toEqual(['b', 'a']);
  });
});

describe('moveWidget / placeWidget', () => {
  it('moves one place and stays within bounds', () => {
    expect(moveWidget(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveWidget(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveWidget(['a', 'b', 'c'], 'c', 5)).toEqual(['a', 'b', 'c']);
  });

  it('places a dragged card at the drop target', () => {
    expect(placeWidget(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(placeWidget(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the order alone for an unknown id', () => {
    expect(moveWidget(['a'], 'z', 1)).toEqual(['a']);
    expect(placeWidget(['a'], 'z', 0)).toEqual(['a']);
  });
});

describe('widgetStateOf', () => {
  it('maps the Link replies of the Hub to card states', () => {
    const data = { title: 'Focus', updatedAt: '2026-10-02T09:00:00Z' };
    expect(widgetStateOf({ result: data })).toEqual({ state: 'ready', data });
    expect(widgetStateOf({ result: null })).toEqual({ state: 'empty', data: null });
    expect(widgetStateOf({ error: 'consent-required' }).state).toBe('consent-required');
    expect(widgetStateOf({ error: 'consent-denied' }).state).toBe('denied');
    expect(widgetStateOf({ error: 'provider-offline' }).state).toBe('offline');
    expect(widgetStateOf({ error: 'timeout' }).state).toBe('error');
    expect(widgetStateOf({ error: 'invalid-result' }).state).toBe('error');
  });
});

describe('refreshInterval', () => {
  it('uses what the app declares, never under 30 s, 5 min by default', () => {
    expect(refreshInterval(undefined)).toBe(300);
    expect(refreshInterval(120)).toBe(120);
    expect(refreshInterval(5)).toBe(30);
  });
});
