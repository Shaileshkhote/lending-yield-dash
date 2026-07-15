export function subgraphSource(args: {
  id: string;
  blockNumber?: string | number | bigint;
  mode?: string;
  alias?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const detail = {
    kind: "subgraph",
    id: args.id,
    blockNumber: args.blockNumber?.toString(),
    mode: args.mode,
    ...(args.extra ?? {}),
  };
  return {
    source: detail,
    [args.alias ?? "subgraph"]: detail,
  };
}

export function graphqlSource(args: {
  endpoint: string;
  chainId?: number;
  mode?: string;
  alias: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const detail = {
    kind: "graphql",
    endpoint: args.endpoint,
    chainId: args.chainId,
    mode: args.mode,
    ...(args.extra ?? {}),
  };
  return {
    source: detail,
    [args.alias]: detail,
  };
}
