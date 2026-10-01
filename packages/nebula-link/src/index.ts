/**
 * @nebula/link — Nebula Link client SDK and shared protocol (docs/NEBULA_LINK.md).
 * Zero runtime dependency: node:net, node:crypto and node:fs only. Runs in an app's main process.
 */
export { NebulaLink, defaultSessionFile } from './client';
export type { CreateOptions, LinkResult, LinkStatus, NotificationInput, QueryContext } from './client';
export { encodeIntentArg, intentFromArgv, isDeclaredIntent, parseDeepLink, INTENT_ARG, MAX_LINK_LENGTH } from './deeplink';
export type { Intent, ParsedLink } from './deeplink';
export { capabilityOf, consumesCapability, parseManifest, parseManifestBytes, providerOf, shortName, APP_ID, CAPABILITY_ID, MAX_MANIFEST_BYTES } from './manifest';
export type { Capability, CapabilityKind, DeepLinkSpec, Localized, Manifest, ManifestResult, ParamType, Sensitivity } from './manifest';
export {
  classify,
  encode,
  errorName,
  errorResponse,
  LineDecoder,
  newToken,
  parseSession,
  proof,
  randomNonce,
  sameProof,
  sha256Hex,
  ERRORS,
  MAX_MESSAGE_BYTES,
  PROTOCOL,
} from './protocol';
export type { Classified, LinkErrorName, RpcError, RpcId, RpcNotification, RpcRequest, RpcResponse, SessionFile } from './protocol';
export { isSchemaName, validateSchema, SCHEMA_NAMES } from './schemas';
export type { SchemaName } from './schemas';
