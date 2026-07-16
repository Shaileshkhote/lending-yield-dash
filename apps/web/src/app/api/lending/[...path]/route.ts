import { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const path = params.path?.join("/") ?? "";
  const upstreamUrl = lendingApiUrl(path, request.nextUrl.search);

  const upstream = await fetch(upstreamUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
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

  headers.set("cache-control", "no-store");
  headers.set("cdn-cache-control", "no-store");
  headers.set("netlify-cdn-cache-control", "no-store");

  return headers;
}
