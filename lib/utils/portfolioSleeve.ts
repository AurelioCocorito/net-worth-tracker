/**
 * Core · Trading · Altro — the three blocks of Patrimonio › Strumenti (owner, 2026-10-25).
 *
 * The owner keeps a CORE of funds (ETF, ETC, bonds) and trades single stocks beside it, and wants
 * the table to show the two apart. The block is decided by the asset's TYPE alone, never by a
 * field the owner types (the owner's choice: the rule «ETF + ETC + obbligazioni = core, azioni
 * singole = trading» is exactly the type), so there is no migration and no form field:
 * - `etf`, `bond`, `commodity` (a gold ETC), `crypto` (a bitcoin ETC, the app's only crypto
 *   wrapper — a direct coin lands here too, a known simplification) → core;
 * - `stock` → trading;
 * - everything else Strumenti lists (a property, a pension fund, a loan, a non-cash account) → altro.
 *
 * Display only, like `resolveDisplayAssetClass`: no total, chart, snapshot or Allocazione figure
 * reads it. Not to be confused with `Asset.allocationRole: 'tradable'`, which means «in the
 * Allocazione plan», not «held for trading».
 */
import type { Asset, AssetType } from '@/types/assets';

export type PortfolioSleeve = 'core' | 'trading' | 'other';

/** The blocks in the order the table draws them, with the words of their header. */
export const PORTFOLIO_SLEEVES: readonly { sleeve: PortfolioSleeve; label: string; description: string }[] = [
  { sleeve: 'core', label: 'Core', description: 'ETF, ETC e obbligazioni' },
  { sleeve: 'trading', label: 'Trading', description: 'Azioni singole' },
  { sleeve: 'other', label: 'Altro', description: 'Immobili, previdenza e prestiti' },
];

const SLEEVE_BY_TYPE: Record<AssetType, PortfolioSleeve> = {
  etf: 'core',
  bond: 'core',
  commodity: 'core',
  crypto: 'core',
  stock: 'trading',
  cash: 'other',
  realestate: 'other',
  pensionFund: 'other',
  loan: 'other',
};

export function resolvePortfolioSleeve(asset: Pick<Asset, 'type'>): PortfolioSleeve {
  return SLEEVE_BY_TYPE[asset.type] ?? 'other';
}

export interface SleeveGroup<T> {
  sleeve: PortfolioSleeve;
  label: string;
  description: string;
  assets: T[];
}

/**
 * The assets split into their blocks, in the blocks' order and, inside each, in the order given
 * (the table's sort). Empty blocks are left out; null when fewer than two blocks hold anything —
 * a single block's header would only repeat the tile's own.
 */
export function groupBySleeve<T extends Pick<Asset, 'type'>>(assets: readonly T[]): SleeveGroup<T>[] | null {
  const groups = PORTFOLIO_SLEEVES.map((entry) => ({ ...entry, assets: [] as T[] }));
  const index = new Map(groups.map((group) => [group.sleeve, group]));
  for (const asset of assets) index.get(resolvePortfolioSleeve(asset))!.assets.push(asset);
  const filled = groups.filter((group) => group.assets.length > 0);
  return filled.length >= 2 ? filled : null;
}
