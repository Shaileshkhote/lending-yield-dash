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

export const protocols = protocolDataFiles as ProtocolData[];

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

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
