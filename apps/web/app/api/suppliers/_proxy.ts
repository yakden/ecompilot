// ─────────────────────────────────────────────────────────────────────────────
// Shared proxy logic for suppliers service Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';

const SUPPLIERS_SERVICE_URL =
  process.env.SUPPLIERS_SERVICE_URL ?? 'http://localhost:3005';
const JWT_SECRET = process.env.JWT_SECRET ?? '';

interface ServiceTokenPayload {
  sub: string;
  email: string;
  plan: string;
  role: string;
  organizationId: string | null;
  language: string;
  iat: number;
  exp: number;
  jti: string;
}

function createServiceToken(payload: ServiceTokenPayload): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

function makeBearerToken(userId: string, plan: string): string {
  const now = Math.floor(Date.now() / 1000);
  return createServiceToken({
    sub: userId,
    email: 'proxy@ecompilot.internal',
    plan,
    role: 'user',
    organizationId: null,
    language: 'ru',
    iat: now,
    exp: now + 300,
    jti: randomUUID(),
  });
}

export async function proxyToSuppliers(
  request: NextRequest,
  upstreamSubpath: string, // e.g. '' | '/search' | '/categories' | '/:id'
): Promise<NextResponse> {
  const userId = request.headers.get('x-proxy-user-id') ?? 'internal-proxy-user';
  const plan = request.headers.get('x-proxy-user-plan') ?? 'pro';

  const searchParams = request.nextUrl.searchParams.toString();
  const upstreamUrl =
    `${SUPPLIERS_SERVICE_URL}/api/v1/suppliers${upstreamSubpath}` +
    (searchParams ? `?${searchParams}` : '');

  const upstreamHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-user-id': userId,
    'x-user-plan': plan,
  };

  // Add HS256 JWT if secret available (bonus auth layer)
  if (JWT_SECRET) {
    const token = makeBearerToken(userId, plan);
    upstreamHeaders['Authorization'] = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    return NextResponse.json(
      {
        success: false,
        error: { message: `Suppliers service unreachable: ${message}` },
      },
      { status: 503 },
    );
  }

  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
