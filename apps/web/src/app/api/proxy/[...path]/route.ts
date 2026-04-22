import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API = process.env.API_INTERNAL_URL || 'http://localhost:3001';

function makeTargetUrl(req: NextRequest, path: string[]): string {
  const base = INTERNAL_API.replace(/\/+$/, '');
  const targetPath = path.join('/');
  const url = new URL(`${base}/${targetPath}`);
  url.search = new URL(req.url).search;
  return url.toString();
}

function copyHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  // Hop-by-hop/transport headers must not be forwarded.
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  return headers;
}

async function proxy(req: NextRequest, path: string[]) {
  const target = makeTargetUrl(req, path);
  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  const upstream = await fetch(target, {
    method,
    headers: copyHeaders(req),
    body: hasBody ? req.body : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('transfer-encoding');

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxy(req, path);
}
