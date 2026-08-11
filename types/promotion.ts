export type PromotionType = 'FLASH_SALE' | 'MULTI_BUY_DISCOUNT';

/**
 * Promo types a merchant can CREATE here. Mirrors the backend gate
 * (pivota-backend PR #1728, PROMO_TYPE_NOT_APPLIED_AT_QUOTE): the infra quote
 * engine applies only MULTI_BUY_DISCOUNT, so a manually created FLASH_SALE
 * would display to shoppers but never change a price. Flash sales and free
 * shipping belong in Shopify — they apply inside Shopify's own pricing and
 * sync in automatically (which is why FLASH_SALE stays in PromotionType:
 * synced promos of that type are still listed and edited).
 */
export const CREATABLE_PROMOTION_TYPES: PromotionType[] = ['MULTI_BUY_DISCOUNT'];

export type Channel = 'web' | 'app' | 'creator_agents';

export interface PromotionScope {
  productIds?: string[];
  categoryIds?: string[];
  brandIds?: string[];
  global?: boolean;
}

export interface PromotionConfigFlashSale {
  kind: 'FLASH_SALE';
  flashPrice: number;
  originalPrice: number;
  stockLimit?: number;
}

export interface PromotionConfigMultiBuy {
  kind: 'MULTI_BUY_DISCOUNT';
  thresholdQuantity: number;
  discountPercent: number;
}

export type PromotionConfig = PromotionConfigFlashSale | PromotionConfigMultiBuy;

/**
 * Each promotion belongs to exactly one merchant. merchantId is always at root.
 * Scope only targets products/categories/brands; it does not define ownership.
 */
export interface Promotion {
  id: string;
  merchantId: string;

  name: string;
  type: PromotionType;
  description?: string;
  startAt: string;
  endAt: string;
  channels: Channel[];
  scope: PromotionScope;
  config: PromotionConfig;

  exposeToCreators: boolean;
  allowedCreatorIds?: string[];

  humanReadableRule: string;
  createdAt: string;
  updatedAt: string;
}

export type PromotionStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED';

export function computePromotionStatus(
  p: Promotion,
  now: Date = new Date()
): PromotionStatus {
  const start = new Date(p.startAt).getTime();
  const end = new Date(p.endAt).getTime();
  const t = now.getTime();

  if (t < start) return 'UPCOMING';
  if (t > end) return 'ENDED';
  return 'ACTIVE';
}
