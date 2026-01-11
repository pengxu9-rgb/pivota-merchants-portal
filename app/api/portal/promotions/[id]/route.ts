import { NextRequest, NextResponse } from 'next/server';
import { Promotion } from '@/types/promotion';

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
  return { merchantId };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPromotion(id: string) {
  try {
    const { res, data } = await fetchJsonWithTimeout(
      `${BASE_URL}/api/merchant/promotions/${id}`,
      {
        headers: { 'X-ADMIN-KEY': ADMIN_KEY as string },
      }
    );
    return { status: res.status, data };
  } catch (err) {
    console.error('[portal/promotions/:id] upstream error', err);
    return { status: 502, data: { error: 'Upstream unavailable' } };
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { merchantId } = getMerchantContext(req);
  if (!merchantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (missingConfig()) {
    return NextResponse.json(
      { error: 'Merchant backend is not configured.' },
      { status: 500 }
    );
  }

  const { status, data } = await fetchPromotion(params.id);
  if (status !== 200) {
    return NextResponse.json(data, { status });
  }
  const promo = data.promotion as Promotion;
  if (!promo || String(promo.merchantId) !== String(merchantId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ promotion: promo });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { merchantId } = getMerchantContext(req);
  if (!merchantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (missingConfig()) {
    return NextResponse.json(
      { error: 'Merchant backend is not configured.' },
      { status: 500 }
    );
  }

  const { status, data } = await fetchPromotion(params.id);
  if (status !== 200) {
    return NextResponse.json(data, { status });
  }
  const promo = data.promotion as Promotion;
  if (!promo || String(promo.merchantId) !== String(merchantId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = { ...body, merchantId: promo.merchantId };

  const upstream = await fetchJsonWithTimeout(
    `${BASE_URL}/api/merchant/promotions/${params.id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-ADMIN-KEY': ADMIN_KEY as string,
      },
      body: JSON.stringify(payload),
    }
  ).catch((err) => {
    console.error('[portal/promotions/:id] upstream error', err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }
  return NextResponse.json(upstream.data, { status: upstream.res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { merchantId } = getMerchantContext(req);
  if (!merchantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (missingConfig()) {
    return NextResponse.json(
      { error: 'Merchant backend is not configured.' },
      { status: 500 }
    );
  }

  const { status, data } = await fetchPromotion(params.id);
  if (status !== 200) {
    return NextResponse.json(data, { status });
  }
  const promo = data.promotion as Promotion;
  if (!promo || String(promo.merchantId) !== String(merchantId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const upstream = await fetchJsonWithTimeout(
    `${BASE_URL}/api/merchant/promotions/${params.id}`,
    {
      method: 'DELETE',
      headers: { 'X-ADMIN-KEY': ADMIN_KEY as string },
    }
  ).catch((err) => {
    console.error('[portal/promotions/:id] delete error', err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }
  return NextResponse.json(upstream.data, { status: upstream.res.status });
}
