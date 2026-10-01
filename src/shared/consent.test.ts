import { decide, hubConsumes, notifyCapability, pairKey, pairsOfApp } from './consent';

describe('consent rules (brief § 8.5)', () => {
  it('allows public capabilities until the user turns them off', () => {
    expect(decide('public', null)).toBe('allow');
    expect(decide('public', 'granted')).toBe('allow');
    expect(decide('public', 'denied')).toBe('deny');
  });

  it('asks before any private capability, then follows the answer', () => {
    expect(decide('private', null)).toBe('ask');
    expect(decide('private', 'granted')).toBe('allow');
    expect(decide('private', 'denied')).toBe('deny');
  });

  it('names pairs and the notification capability', () => {
    expect(pairKey('nebula.hub', 'finterest.budget.remaining')).toBe('nebula.hub|finterest.budget.remaining');
    expect(notifyCapability('nebula.finterest')).toBe('finterest.notify');
  });

  it('lets the Hub consume widgets and notification events only', () => {
    expect(hubConsumes({ kind: 'widget' })).toBe(true);
    expect(hubConsumes({ kind: 'event', payloadSchema: 'NotificationV1' })).toBe(true);
    expect(hubConsumes({ kind: 'event', payloadSchema: 'BreakStartedV1' })).toBe(false);
    expect(hubConsumes({ kind: 'query' })).toBe(false);
  });

  it('finds every pair of an app, as consumer or provider', () => {
    const pairs = [
      { consumer: 'nebula.hub', provider: 'nebula.finterest', id: 1 },
      { consumer: 'nebula.news', provider: 'nebula.clock', id: 2 },
      { consumer: 'nebula.clock', provider: 'nebula.hub', id: 3 },
    ];
    expect(pairsOfApp(pairs, 'nebula.clock').map((pair) => pair.id)).toEqual([2, 3]);
  });
});
