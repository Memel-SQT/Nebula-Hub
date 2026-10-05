import type { AppearancePack } from '@nebula/link';
import type { InstalledView } from '../shared/installed-view';
import { installedPacks, type PackView } from '../shared/packs';

export interface AppearancePacksDeps {
  /** The valid packs of the shared folder whose owner's executable exists (`readAppearancePacks`). */
  read(): AppearancePack[];
  installedView(): InstalledView;
}

function svgUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function toPackView(pack: AppearancePack): PackView {
  const hubMark = pack.marks['nebula.hub'] ?? pack.mark;
  return {
    id: pack.id,
    ownerAppId: pack.owner.appId,
    themes: pack.themes,
    names: pack.names,
    markUrl: hubMark ? svgUrl(hubMark) : null,
    iconUrls: Object.fromEntries(Object.entries(pack.marks).map(([appId, svg]) => [appId, svgUrl(svg)])),
  };
}

/**
 * The appearance packs the Hub offers (docs/NEBULA_LINK.md § 18): read from the shared folder at
 * startup and after every detection, kept only while their owner app is detected installed. Nothing
 * of a pack is ever shown before it passed `parseAppearancePack`.
 */
export class AppearancePacks {
  private packs: PackView[] = [];
  private readonly listeners = new Set<(packs: PackView[]) => void>();

  constructor(private readonly deps: AppearancePacksDeps) {}

  view(): PackView[] {
    return this.packs;
  }

  /** Reads the folder again; listeners only hear about a real change. */
  reload(): boolean {
    let read: AppearancePack[];
    try {
      read = this.deps.read();
    } catch {
      read = [];
    }
    const next = installedPacks(read.map(toPackView), this.deps.installedView());
    if (JSON.stringify(next) === JSON.stringify(this.packs)) return false;
    this.packs = next;
    for (const listener of this.listeners) listener(next);
    return true;
  }

  onChange(listener: (packs: PackView[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
