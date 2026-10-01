import type { NebulaHubBridge } from './bridge';

declare global {
  interface Window {
    nebulaHub: NebulaHubBridge;
  }
}

export {};
