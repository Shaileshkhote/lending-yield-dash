type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

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

export async function queryGraphqlEndpoint<T>(args: {
  endpoint: string;
  query: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
  name?: string;
}): Promise<T> {
  const body = JSON.stringify({ query: args.query, variables: args.variables ?? {} });
  const result = await requestGraphql<T>(args.endpoint, body, args.headers);
  const source = args.name ?? args.endpoint;

  if (!result.ok || result.json.errors?.length) {
    const message = result.json.errors?.map((error) => error.message).join(" | ") || result.statusText;
    throw new Error(`GraphQL query failed for ${source}: ${message}`);
  }
  if (!result.json.data) {
    throw new Error(`GraphQL query returned no data for ${source}`);
  }
  return result.json.data;
}

async function requestGraphql<T>(endpoint: string, body: string, headers: Record<string, string> = {}) {
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
    json
  };
}

function isAuthError(result: { status: number; json: GraphqlResponse<unknown> }): boolean {
  if (result.status === 401 || result.status === 403) return true;
  return result.json.errors?.some((error) => error.message.toLowerCase().includes("auth error")) ?? false;
}
