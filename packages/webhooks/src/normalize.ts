/** Shapes of the two webhook payloads we consume (JSON format, API 2026-10) and their normalized forms. */

/** Integer ids arrive as numbers, or as digit strings when they exceed 2^53 (see json.ts). */
type ShopifyId = number | string;

export interface OrderCreatePayload {
  id: ShopifyId;
  admin_graphql_api_id: string;
  name: string;
  created_at: string;
  currency: string;
  presentment_currency?: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  line_items: Array<{ id: ShopifyId; variant_id: ShopifyId | null; sku: string | null; title: string; quantity: number; price: string }>;
}

export interface InventoryLevelUpdatePayload {
  inventory_item_id: ShopifyId;
  location_id: ShopifyId;
  available: number | null;
  updated_at: string;
  admin_graphql_api_id?: string;
}

export interface NormalizedOrder {
  orderId: string;
  name: string;
  createdAt: string;
  currency: string;
  presentmentCurrency: string;
  totalPrice: string;
  subtotalPrice: string;
  totalDiscounts: string;
  lineItems: Array<{ variantId: string | null; sku: string | null; title: string; quantity: number; price: string }>;
}

export interface InventoryObservation {
  inventoryItemId: string;
  locationId: string;
  available: number;
  updatedAt: string;
  webhookId: string;
}

export const gid = (type: string, id: ShopifyId) => `gid://shopify/${type}/${id}`;
export const legacyId = (globalId: string) => globalId.slice(globalId.lastIndexOf('/') + 1);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const isId = (value: unknown): value is ShopifyId =>
  (typeof value === 'number' && Number.isSafeInteger(value)) || (typeof value === 'string' && /^\d+$/.test(value));

export function normalizeOrder(payload: unknown): NormalizedOrder {
  if (!isObject(payload) || !isId(payload.id) || !Array.isArray(payload.line_items)) {
    throw new Error('orders/create payload is missing id or line_items');
  }
  const order = payload as unknown as OrderCreatePayload;
  return {
    orderId: order.admin_graphql_api_id ?? gid('Order', order.id),
    name: order.name,
    createdAt: order.created_at,
    currency: order.currency,
    presentmentCurrency: order.presentment_currency ?? order.currency,
    totalPrice: order.total_price,
    subtotalPrice: order.subtotal_price,
    totalDiscounts: order.total_discounts,
    lineItems: order.line_items.map((li) => ({
      variantId: li.variant_id ? gid('ProductVariant', li.variant_id) : null,
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      price: li.price,
    })),
  };
}

export function normalizeInventoryLevel(payload: unknown, webhookId: string): InventoryObservation {
  if (!isObject(payload) || !isId(payload.inventory_item_id) || !isId(payload.location_id)) {
    throw new Error('inventory_levels/update payload is missing inventory_item_id or location_id');
  }
  const level = payload as unknown as InventoryLevelUpdatePayload;
  return {
    inventoryItemId: gid('InventoryItem', level.inventory_item_id),
    locationId: gid('Location', level.location_id),
    available: level.available ?? 0,
    updatedAt: level.updated_at,
    webhookId,
  };
}
