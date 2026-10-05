import { createContext, useContext } from 'react';

/**
 * The active appearance pack's brand (docs/NEBULA_LINK.md § 18): app names renamed inside every
 * translated sentence, and the mark shown in place of the Hub's. Empty when no pack theme is active.
 */
export interface PackBrand {
  pairs: ReadonlyArray<[string, string]>;
  markUrl: string | null;
}

export const NO_PACK_BRAND: PackBrand = { pairs: [], markUrl: null };

export const PackBrandContext = createContext<PackBrand>(NO_PACK_BRAND);

export function usePackBrand(): PackBrand {
  return useContext(PackBrandContext);
}
