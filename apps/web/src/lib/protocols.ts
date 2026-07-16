import { getProtocolChildData, getProtocolData, protocolGroupIdForSlug, type ProtocolChildData, type ProtocolData } from "@lendingscope/protocol-data";
import type { LendingMarket } from "./api";

export type ProtocolVariant = {
  id: string;
  label: string;
  metadata?: ProtocolChildData;
  markets: LendingMarket[];
};

export type ProtocolGroup = {
  id: string;
  label: string;
  symbol: string;
  metadata?: ProtocolData;
  markets: LendingMarket[];
  variants: ProtocolVariant[];
};

export type ProtocolSelection = {
  group: ProtocolGroup;
  variant?: ProtocolVariant;
  label: string;
  markets: LendingMarket[];
};

export function buildProtocolGroups(markets: LendingMarket[]): ProtocolGroup[] {
  const grouped = new Map<string, LendingMarket[]>();
  for (const market of markets) {
    const id = protocolGroupId(market);
    grouped.set(id, [...(grouped.get(id) ?? []), market]);
  }

  return [...grouped.entries()]
    .map(([id, rows]) => {
      const variants = [...new Map(rows.map((market) => [market.protocolSlug, market.protocol])).entries()]
        .map(([variantId, label]) => {
          const childMeta = getProtocolChildData(variantId);
          return {
            id: variantId,
            label: childMeta?.name ?? label,
            metadata: childMeta,
            markets: rows.filter((market) => market.protocolSlug === variantId),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
      const meta = getProtocolData(id);
      return {
        id,
        label: meta?.name ?? rows[0]?.protocol ?? titleCase(id),
        symbol: meta?.symbol ?? protocolSymbol(rows[0]?.protocol ?? id),
        metadata: meta,
        markets: rows,
        variants,
      };
    })
    .sort((a, b) => b.markets.length - a.markets.length || a.label.localeCompare(b.label));
}

export function protocolPath(id: string): string {
  return `/lending/protocols/${encodeURIComponent(id)}`;
}

export function resolveProtocolSelection(groups: ProtocolGroup[], id: string): ProtocolSelection | null {
  const group = groups.find((item) => item.id === id);
  if (group) {
    return { group, label: group.label, markets: group.markets };
  }

  for (const item of groups) {
    const variant = item.variants.find((candidate) => candidate.id === id);
    if (variant) {
      return {
        group: item,
        variant,
        label: variant.label,
        markets: variant.markets,
      };
    }
  }

  return null;
}

export function protocolStats(markets: LendingMarket[]) {
  const supplied = markets.reduce((sum, market) => sum + (market.totalSuppliedUsd ?? 0), 0);
  const borrowed = markets.reduce((sum, market) => sum + (market.totalBorrowedUsd ?? 0), 0);
  const weightedApyNumerator = markets.reduce((sum, market) => {
    const weight = market.totalSuppliedUsd ?? 0;
    return sum + weight * (market.netSupplyApy ?? market.supplyApy ?? 0);
  }, 0);
  return {
    markets: markets.length,
    supplied,
    borrowed,
    weightedSupplyApy: supplied > 0 ? weightedApyNumerator / supplied : null,
  };
}

function protocolGroupId(market: LendingMarket): string {
  return protocolGroupIdForSlug(market.protocolSlug);
}

function protocolSymbol(protocol: string): string {
  return protocol
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1))
    .join("")
    .slice(0, 6)
    .toUpperCase();
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
