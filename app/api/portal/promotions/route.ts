import { NextRequest, NextResponse } from 'next/server';
import { computePromotionStatus, Promotion } from '@/types/promotion';

const BASE_URL = process.env.MERCHANT_API_BASE_URL;
const ADMIN_KEY = process.env.MERCHANT_ADMIN_KEY;

const UPSTREAM_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.MERCHANT_UPSTREAM_TIMEOUT_MS ?? 8000) || 8000
);

function missingConfig() {
  return !BASE_URL || !ADMIN_KEY;
}

function getMerchantContext(req: NextRequest) {
  const merchantId =
    req.headers.get('x-merchant-id') ||
    req.headers.get('X-Merchant-Id') ||
    req.nextUrl.searchParams.get('merchantId') ||
    '';
  const authHeader = req.headers.get('authorization') || undefined;
  return { merchantId, authHeader };
}

async function proxyFetch(path: string, init: RequestInit = {}) {
  if (missingConfig()) {
    return NextResponse.json(
      { error: 'Merchant backend is not configured.' },
      { status: 500 }
    );
  }

  const url = `${BASE_URL}${path}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'X-ADMIN-KEY': ADMIN_KEY as string,
          ...(init.headers || {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error('[portal/promotions] proxy error', err);
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const { merchantId } = getMerchantContext(req);
  if (!merchantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL('/api/merchant/promotions', BASE_URL);
  url.searchParams.set('merchantId', merchantId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const upstream = await fetch(url.toString(), {
    headers: { 'X-ADMIN-KEY': ADMIN_KEY as string },
    cache: 'no-store',
    signal: controller.signal,
  })
    .catch((err) => {
      console.error('[portal/promotions] upstream error', err);
      return null;
    })
    .finally(() => clearTimeout(timeout));

  if (!upstream) {
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }

  const status = upstream.status;
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(data || { error: 'Upstream error' }, { status });
  }

  const promos: Promotion[] = (data.promotions || []).filter(
    (p: Promotion) => String(p.merchantId) === String(merchantId)
  );

  return NextResponse.json({ promotions: promos, total: promos.length });
}

export async function POST(req: NextRequest) {
  const { merchantId } = getMerchantContext(req);
  if (!merchantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = { ...body, merchantId };

  return proxyFetch('/api/merchant/promotions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
