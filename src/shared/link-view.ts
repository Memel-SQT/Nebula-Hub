import type { ConsentDecision, ConsentState } from './consent';

/** What the Integrations screen receives about Nebula Link (docs/NEBULA_LINK.md § 6). */
export type LinkKind = 'query' | 'event' | 'intent' | 'widget';

export interface LinkCapabilityView {
  id: string;
  /** App id of the app that provides it (`nebula.hub` for the Hub's). */
  provider: string;
  kind: LinkKind;
  sensitivity: 'public' | 'private';
  title: { fr: string; en?: string };
  description: { fr: string; en?: string };
}

export interface LinkPairView {
  consumer: string;
  capability: string;
  provider: string;
  sensitivity: 'public' | 'private';
  /** What the user decided (null: never asked / default). */
  state: ConsentState | null;
  /** What the Hub does now. */
  decision: ConsentDecision;
  /** Date of the last exchange for this pair (link_audit), if any. */
  lastExchange: string | null;
}

export interface LinkView {
  state: 'starting' | 'listening' | 'error';
  connected: Array<{ appId: string; since: string }>;
  capabilities: LinkCapabilityView[];
  pairs: LinkPairView[];
  /** Private pairs waiting for the user's answer. */
  pending: Array<{ consumer: string; capability: string; at: string }>;
}

export const EMPTY_LINK_VIEW: LinkView = { state: 'starting', connected: [], capabilities: [], pairs: [], pending: [] };
