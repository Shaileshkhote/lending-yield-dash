import { NextRequest } from "next/server";

const CACHE_TTL_SECONDS = 86_400;

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export const revalidate = 86_400;

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const path = params.path?.join("/") ?? "";
  const upstreamUrl = lendingApiUrl(path, request.nextUrl.search);

  const upstream = await fetch(upstreamUrl, {
    headers: { accept: "application/json" },
    next: { revalidate: CACHE_TTL_SECONDS },
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders(upstream),
  });
}

function lendingApiUrl(path: string, search: string): string {
  const baseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("Missing API_BASE_URL or NEXT_PUBLIC_API_BASE_URL for lending API proxy.");
  }
  const url = new URL(`/api/lending/${path}`, baseUrl.replace(/\/$/, ""));
  url.search = search;
  return url.toString();
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  if (upstream.ok) {
    const cacheValue = `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`;
    headers.set("cache-control", cacheValue);
    headers.set("cdn-cache-control", cacheValue);
    headers.set("netlify-cdn-cache-control", cacheValue);
  } else {
    headers.set("cache-control", "no-store");
  }

  return headers;
}
