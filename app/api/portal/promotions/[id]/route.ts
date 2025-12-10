import { NextRequest, NextResponse } from 'next/server';
import { Promotion } from '@/types/promotion';

const BASE_URL = process.env.MERCHANT_API_BASE_URL;
const ADMIN_KEY = process.env.MERCHANT_ADMIN_KEY;

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

async function fetchPromotion(id: string) {
  const res = await fetch(`${BASE_URL}/api/merchant/promotions/${id}`, {
    headers: { 'X-ADMIN-KEY': ADMIN_KEY as string },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
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

  const upstream = await fetch(`${BASE_URL}/api/merchant/promotions/${params.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-ADMIN-KEY': ADMIN_KEY as string,
    },
    cache: 'no-store',
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.error('[portal/promotions/:id] upstream error', err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }
  const respData = await upstream.json().catch(() => ({}));
  return NextResponse.json(respData, { status: upstream.status });
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

  const upstream = await fetch(`${BASE_URL}/api/merchant/promotions/${params.id}`, {
    method: 'DELETE',
    headers: { 'X-ADMIN-KEY': ADMIN_KEY as string },
    cache: 'no-store',
  }).catch((err) => {
    console.error('[portal/promotions/:id] delete error', err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }
  const respData = await upstream.json().catch(() => ({}));
  return NextResponse.json(respData, { status: upstream.status });
}
