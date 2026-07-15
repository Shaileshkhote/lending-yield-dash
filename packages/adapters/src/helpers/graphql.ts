type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type GraphqlResult<T> = {
  ok: boolean;
  status: number;
  statusText: string;
  retryAfterMs?: number;
  json: GraphqlResponse<T>;
};

const endpointPaces = new Map<string, Promise<void>>();

export function graphApiKey(): string | undefined {
  return process.env.THE_GRAPH_API_KEY?.trim() || undefined;
}

export function hasGraphApiKey(): boolean {
  return Boolean(graphApiKey());
}

export async function queryTheGraph<T>(args: {
  subgraphId: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const key = graphApiKey();
  if (!key) {
    throw new Error("Missing THE_GRAPH_API_KEY");
  }

  const baseUrl = process.env.THE_GRAPH_GATEWAY_URL?.trim()?.replace(/\/$/, "") || "https://gateway.thegraph.com/api";
  const body = JSON.stringify({ query: args.query, variables: args.variables ?? {} });
  const primary = await requestGraphql<T>(`${baseUrl}/subgraphs/id/${args.subgraphId}`, body, {
    authorization: `Bearer ${key}`
  });
  const result = isAuthError(primary)
    ? await requestGraphql<T>(`${baseUrl}/${key}/subgraphs/id/${args.subgraphId}`, body)
    : primary;

  if (!result.ok || result.json.errors?.length) {
    const message = result.json.errors?.map((error) => error.message).join(" | ") || result.statusText;
    throw new Error(`The Graph query failed for ${args.subgraphId}: ${message}`);
  }
  if (!result.json.data) {
    throw new Error(`The Graph query returned no data for ${args.subgraphId}`);
  }
  return result.json.data;
}

export async function paginateTheGraph<TData, TItem>(args: {
  subgraphId: string;
  query: string;
  variables?: Record<string, unknown>;
  pageSize?: number;
  getItems: (data: TData) => TItem[];
}): Promise<{ items: TItem[]; lastData?: TData }> {
  return paginateGraphql<TData, TItem>({
    pageSize: args.pageSize,
    variables: args.variables,
    getItems: args.getItems,
    query: (variables) =>
      queryTheGraph<TData>({
        subgraphId: args.subgraphId,
        query: args.query,
        variables,
      }),
  });
}

export async function queryGraphqlEndpoint<T>(args: {
  endpoint: string;
  query: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
  name?: string;
}): Promise<T> {
  const body = JSON.stringify({ query: args.query, variables: args.variables ?? {} });
  const source = args.name ?? args.endpoint;
  const attempts = envPositiveInt("GRAPHQL_RETRIES", 3);
  let lastResult: GraphqlResult<T> | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await requestGraphql<T>(args.endpoint, body, args.headers);
    lastResult = result;
    if (result.ok && !result.json.errors?.length) {
      if (!result.json.data) {
        throw new Error(`GraphQL query returned no data for ${source}`);
      }
      return result.json.data;
    }

    if (!isRetryableGraphqlError(result) || attempt === attempts) break;
    await sleep(retryDelayMs(result, attempt));
  }

  if (!lastResult) {
    throw new Error(`GraphQL query failed for ${source}: no response`);
  }
  const message = lastResult.json.errors?.map((error) => error.message).join(" | ") || lastResult.statusText;
  throw new Error(`GraphQL query failed for ${source}: ${message}`);
}

export async function paginateGraphqlEndpoint<TData, TItem>(args: {
  endpoint: string;
  query: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
  name?: string;
  pageSize?: number;
  getItems: (data: TData) => TItem[];
}): Promise<{ items: TItem[]; lastData?: TData }> {
  return paginateGraphql<TData, TItem>({
    pageSize: args.pageSize,
    variables: args.variables,
    getItems: args.getItems,
    query: (variables) =>
      queryGraphqlEndpoint<TData>({
        endpoint: args.endpoint,
        name: args.name,
        headers: args.headers,
        query: args.query,
        variables,
      }),
  });
}

async function paginateGraphql<TData, TItem>(args: {
  variables?: Record<string, unknown>;
  pageSize?: number;
  getItems: (data: TData) => TItem[];
  query: (variables: Record<string, unknown>) => Promise<TData>;
}): Promise<{ items: TItem[]; lastData?: TData }> {
  const pageSize = args.pageSize ?? 1000;
  const items: TItem[] = [];
  let lastData: TData | undefined;

  for (let skip = 0; ; skip += pageSize) {
    const data = await args.query({
      ...(args.variables ?? {}),
      first: pageSize,
      skip,
    });
    const page = args.getItems(data);
    items.push(...page);
    lastData = data;
    if (page.length < pageSize) break;
  }

  return { items, lastData };
}

async function requestGraphql<T>(
  endpoint: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<GraphqlResult<T>> {
  await paceEndpoint(endpoint);
  const requestSleepMs = envNonNegativeInt("GRAPHQL_REQUEST_SLEEP_MS", 0);
  if (requestSleepMs > 0) {
    await sleep(requestSleepMs);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body
  });
  const text = await response.text();
  let json: GraphqlResponse<T>;
  try {
    json = JSON.parse(text) as GraphqlResponse<T>;
  } catch {
    throw new Error(`GraphQL endpoint returned non-JSON response (${response.status}): ${text.slice(0, 200)}`);
  }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
    json
  };
}

function isAuthError(result: { status: number; json: GraphqlResponse<unknown> }): boolean {
  if (result.status === 401 || result.status === 403) return true;
  return result.json.errors?.some((error) => error.message.toLowerCase().includes("auth error")) ?? false;
}

function isRetryableGraphqlError(result: {
  status: number;
  statusText: string;
  json: GraphqlResponse<unknown>;
}): boolean {
  if (result.status === 429 || result.status >= 500) return true;
  const message = [
    result.statusText,
    ...(result.json.errors?.map((error) => error.message) ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return (
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable")
  );
}

function retryDelayMs(
  result: { retryAfterMs?: number },
  attempt: number,
): number {
  const retryAfter = result.retryAfterMs;
  if (retryAfter !== undefined) return retryAfter;

  const base = envNonNegativeInt("GRAPHQL_RETRY_BASE_MS", 1_000);
  const max = envPositiveInt("GRAPHQL_RETRY_MAX_MS", 30_000);
  const jitter = Math.floor(Math.random() * Math.max(250, base));
  return Math.min(max, base * 2 ** (attempt - 1) + jitter);
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

async function paceEndpoint(endpoint: string): Promise<void> {
  const interval = endpointMinIntervalMs(endpoint);
  if (interval <= 0) return;

  const previous = endpointPaces.get(endpoint) ?? Promise.resolve();
  let release!: () => void;
  const current = previous
    .catch(() => undefined)
    .then(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
  endpointPaces.set(endpoint, current);

  await previous.catch(() => undefined);
  setTimeout(release, interval);
}

function endpointMinIntervalMs(endpoint: string): number {
  if (endpoint.includes("api.morpho.org")) {
    return envNonNegativeInt(
      "MORPHO_GRAPHQL_MIN_INTERVAL_MS",
      envNonNegativeInt("GRAPHQL_ENDPOINT_MIN_INTERVAL_MS", 0),
    );
  }
  if (endpoint.includes("gateway.thegraph.com")) {
    return envNonNegativeInt(
      "THE_GRAPH_MIN_INTERVAL_MS",
      envNonNegativeInt("GRAPHQL_ENDPOINT_MIN_INTERVAL_MS", 0),
    );
  }
  return envNonNegativeInt("GRAPHQL_ENDPOINT_MIN_INTERVAL_MS", 0);
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
