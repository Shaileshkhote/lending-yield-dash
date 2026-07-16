import chainData from "./data/chains.json";
import { protocolDataFiles } from "./generated/protocols";

export type ProtocolPoolLinks = {
  app?: string;
  docs?: string;
  fallbackApp?: string;
  chainIds?: Record<string, string | number>;
  marketNames?: Record<string, string>;
  marketNameTemplate?: string;
};

export type ProtocolChildData = {
  id: string;
  adapterSlug: string;
  name: string;
  symbol?: string;
  description?: string;
  logo?: string;
  website?: string;
  app?: string;
  docs?: string;
  x?: string;
  poolLinks?: ProtocolPoolLinks;
};

export type ProtocolData = {
  id: string;
  slugs: string[];
  aliases?: string[];
  children?: ProtocolChildData[];
  name: string;
  symbol: string;
  description: string;
  logo: string;
  website: string;
  app?: string;
  docs?: string;
  x?: string;
  poolLinks?: ProtocolPoolLinks;
};

export type ChainData = {
  id: string;
  aliases?: string[];
  label: string;
  short: string;
  logo?: string;
  trustWalletSlug?: string;
};

export const protocols = protocolDataFiles as ProtocolData[];
export const chains = chainData as ChainData[];

export const protocolsById = Object.fromEntries(
  protocols.map((protocol) => [protocol.id, protocol]),
) as Record<string, ProtocolData>;

export const protocolsBySlug = Object.fromEntries(
  protocols.flatMap((protocol) =>
    protocol.slugs.map((slug) => [slug, protocol] as const),
  ),
) as Record<string, ProtocolData>;

const protocolChildrenBySlug = Object.fromEntries(
  protocols.flatMap((protocol) =>
    (protocol.children ?? []).map((child) => [
      child.adapterSlug,
      { ...child, parentId: protocol.id },
    ] as const),
  ),
) as Record<string, ProtocolChildData & { parentId: string }>;

const protocolsByName = Object.fromEntries(
  protocols.flatMap((protocol) =>
    [
      protocol.name,
      ...(protocol.aliases ?? []),
      ...(protocol.children ?? []).map((child) => child.name),
    ].map((name) => [
      normalizeName(name),
      protocol,
    ] as const),
  ),
) as Record<string, ProtocolData>;

export function getProtocolData(idOrSlug: string): ProtocolData | undefined {
  return protocolsById[idOrSlug] ?? protocolsBySlug[idOrSlug];
}

export function getProtocolChildData(slug: string): (ProtocolChildData & { parentId: string }) | undefined {
  return protocolChildrenBySlug[slug];
}

export function getProtocolDataByName(name: string): ProtocolData | undefined {
  return protocolsByName[normalizeName(name)];
}

export function listProtocolDisplayNames(): string[] {
  return protocols.flatMap((protocol) =>
    protocol.children?.length
      ? protocol.children.map((child) => child.name)
      : [protocol.name],
  );
}

export function getProtocolLinksForSlug(slug: string):
  | Pick<ProtocolData, "website" | "app" | "docs" | "x"> & { poolLinks?: ProtocolPoolLinks }
  | undefined {
  const child = protocolChildrenBySlug[slug];
  const parent = child ? protocolsById[child.parentId] : getProtocolData(slug);
  if (!parent) return undefined;
  return {
    website: child?.website ?? parent.website,
    app: child?.app ?? parent.app,
    docs: child?.docs ?? parent.docs,
    x: child?.x ?? parent.x,
    poolLinks: parent.poolLinks || child?.poolLinks
      ? { ...parent.poolLinks, ...child?.poolLinks }
      : undefined,
  };
}

export function protocolGroupIdForSlug(slug: string): string {
  return protocolChildrenBySlug[slug]?.parentId ?? protocolsBySlug[slug]?.id ?? slug;
}

const chainsById = Object.fromEntries(
  chains.flatMap((chain) => [
    [normalizeChainId(chain.id), chain] as const,
    ...(chain.aliases ?? []).map((alias) => [normalizeChainId(alias), chain] as const),
  ]),
) as Record<string, ChainData>;

export function getChainData(chain: string): ChainData | undefined {
  return chainsById[normalizeChainId(chain)];
}

export function chainMeta(chain: string): { label: string; short: string } {
  const metadata = getChainData(chain);
  return metadata
    ? { label: metadata.label, short: metadata.short }
    : { label: titleCase(chain), short: chain.slice(0, 5).toUpperCase() };
}

export function trustWalletChainLogoUrl(chain?: string): string | null {
  if (!chain) return null;
  const slug = trustWalletChainSlug(chain);
  if (!slug) return null;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/info/logo.png`;
}

export function trustWalletChainSlug(chain: string): string | undefined {
  return getChainData(chain)?.trustWalletSlug;
}

export function chainLogoUrls(chain?: string): string[] {
  if (!chain) return [];
  const normalized = normalizeChainId(chain);
  const metadata = getChainData(chain);
  return unique([
    metadata?.logo,
    trustWalletChainLogoUrl(chain),
    `https://icons.llamao.fi/icons/chains/rsz_${metadata?.id ?? normalized}?w=48&h=48`,
  ]);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeChainId(chain: string): string {
  return chain.trim().toLowerCase();
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
