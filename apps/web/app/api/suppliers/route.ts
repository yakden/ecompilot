// GET /api/suppliers  →  suppliers-svc GET /api/v1/suppliers
import { type NextRequest } from 'next/server';
import { proxyToSuppliers } from './_proxy';

export async function GET(request: NextRequest) {
  return proxyToSuppliers(request, '');
}
