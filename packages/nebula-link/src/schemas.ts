/**
 * Schema registry (docs/NEBULA_LINK.md § 8). Every result and payload crossing Link is checked
 * against the schema its capability declares, on both sides: the Hub never shows or forwards a
 * value of the wrong shape, and texts are bounded so a buggy app cannot flood a screen.
 * A breaking change makes a new name (`…V2`).
 */
export const SCHEMA_NAMES = ['AppearanceV1', 'WidgetV1', 'NotificationV1', 'HeadlinesV1', 'FocusTodayV1', 'BreakStartedV1', 'PresenceV1', 'EmptyV1'] as const;
export type SchemaName = (typeof SCHEMA_NAMES)[number];

export function isSchemaName(value: unknown): value is SchemaName {
  return typeof value === 'string' && (SCHEMA_NAMES as readonly string[]).includes(value);
}

type Check = (value: unknown) => boolean;

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (max: number, optional = false): Check => (value) => (optional && value === undefined) || (typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
const integer = (min: number, max: number): Check => (value) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isoDate: Check = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isoTime: Check = (value) => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
const deepLink = (optional = true): Check => (value) => (optional && value === undefined) || (typeof value === 'string' && value.length <= 2000 && value.startsWith('nebula://'));

/** Exactly these keys (no more), each passing its check. */
function shape(fields: Record<string, Check>): Check {
  return (value) => record(value)
    && Object.keys(value).every((key) => key in fields)
    && Object.entries(fields).every(([key, check]) => check(value[key]));
}

const list = (item: Check, max: number): Check => (value) => Array.isArray(value) && value.length <= max && value.every(item);

const CHECKS: Record<SchemaName, Check> = {
  // The I1 object (brief § 10.4). Types only here: each app validates the values with the shared
  // field-by-field parser of @nebula/design, which knows the allowed themes, accents…
  AppearanceV1: shape({
    theme: text(40),
    accentPreset: text(40),
    customPrimary: text(20),
    customSecondary: text(20),
    background: text(40),
    motion: text(20),
    soundEnabled: (value) => typeof value === 'boolean',
    soundVolume: integer(0, 100),
    language: text(10),
  }),
  WidgetV1: shape({
    title: text(80),
    value: text(80, true),
    unit: text(20, true),
    caption: text(80, true),
    items: (value) => value === undefined || list(shape({ label: text(80), value: text(80) }), 5)(value),
    deepLink: deepLink(),
    updatedAt: isoTime,
  }),
  NotificationV1: shape({
    id: text(80, true),
    title: text(80),
    body: text(300),
    sensitivity: (value) => value === 'public' || value === 'private',
    deepLink: deepLink(),
    category: text(40, true),
  }),
  HeadlinesV1: shape({ date: isoDate, items: list(shape({ title: text(160), source: text(80), deepLink: deepLink(false) }), 3) }),
  FocusTodayV1: shape({ date: isoDate, done: integer(0, 1000), goal: integer(0, 1000), streak: integer(0, 100_000) }),
  BreakStartedV1: shape({ kind: (value) => value === 'short' || value === 'long', durationMin: integer(1, 240) }),
  PresenceV1: shape({ hubVersion: text(40), protocol: text(40), managesUpdates: (value) => typeof value === 'boolean' }),
  EmptyV1: shape({}),
};

export function validateSchema(name: SchemaName, value: unknown): boolean {
  return CHECKS[name](value);
}
