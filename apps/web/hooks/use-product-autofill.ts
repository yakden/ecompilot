'use client';

/**
 * use-product-autofill.ts
 *
 * Re-exports barcode lookup from use-product-lookup and exposes useAddProduct
 * so the add-product UI has a single import point for both operations.
 */

export {
  useBarcodeLookup,
  type BarcodeLookupResult,
  type ProductSource,
  type Nutriments,
} from './use-product-lookup';

export { useCreateProduct as useAddProduct } from './use-inventory';
export type { CreateProductPayload } from './use-inventory';
