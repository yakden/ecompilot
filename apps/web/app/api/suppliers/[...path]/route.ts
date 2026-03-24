// ─────────────────────────────────────────────────────────────────────────────
// Suppliers service proxy — catch-all Route Handler
//
// Handles /api/suppliers/* requests by proxying to suppliers-service with
// a server-generated HS256 Bearer token. The frontend never needs JWT_SECRET.
//
// Examples:
//   GET  /api/suppliers/search?q=shoes
//   GET  /api/suppliers/categories
//   GET  /api/suppliers/featured
//   GET  /api/suppliers/:id
//   POST /api/suppliers/:id/click
//   POST /api/suppliers/:id/reviews
// ─────────────────────────────────────────────────────────────────────────────

import { type NextRequest } from 'next/server';
import { proxyToSuppliers } from '../_proxy';

interface RouteContext {
  params: Promise<{ path?: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const subpath = path && path.length > 0 ? '/' + path.join('/') : '';
  return proxyToSuppliers(request, subpath);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const subpath = path && path.length > 0 ? '/' + path.join('/') : '';
  return proxyToSuppliers(request, subpath);
}
