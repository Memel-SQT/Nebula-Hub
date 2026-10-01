/**
 * Nebula Link consent rules (docs/NEBULA_LINK.md § 6, brief § 8.5), as pure functions.
 *
 * A pair is (consumer, capability): an app, or the Hub itself, using one capability of another
 * app. `public` capabilities are allowed until the user turns them off; `private` ones are refused
 * until the user says yes. The first request for an undecided private pair does not wait: the
 * caller gets `consent-required` and the Hub asks the user.
 */
export const HUB_ID = 'nebula.hub';

export type ConsentState = 'granted' | 'denied';
export type ConsentDecision = 'allow' | 'ask' | 'deny';
export type Sensitivity = 'public' | 'private';

export function decide(sensitivity: Sensitivity, state: ConsentState | null): ConsentDecision {
  if (state === 'denied') return 'deny';
  if (state === 'granted' || sensitivity === 'public') return 'allow';
  return 'ask';
}

export function pairKey(consumer: string, capability: string): string {
  return `${consumer}|${capability}`;
}

/**
 * The synthetic capability under which an app sends notifications to the Hub's activity center
 * (`link.notify`): `nebula.finterest` → `finterest.notify`. Each notification carries its own
 * sensitivity; private ones need the user's yes for this pair.
 */
export function notifyCapability(appId: string): string {
  return `${appId.startsWith('nebula.') ? appId.slice('nebula.'.length) : appId}.notify`;
}

/** What the Hub itself consumes without a manifest: widgets, and events made of notifications. */
export function hubConsumes(capability: { kind: string; payloadSchema?: string }): boolean {
  return capability.kind === 'widget' || (capability.kind === 'event' && capability.payloadSchema === 'NotificationV1');
}

/** "Refuse everything for this app": every pair where the app is the consumer or the provider. */
export function pairsOfApp<T extends { consumer: string; provider: string }>(pairs: readonly T[], appId: string): T[] {
  return pairs.filter((pair) => pair.consumer === appId || pair.provider === appId);
}
