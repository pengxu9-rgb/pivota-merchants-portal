const portalBaseUrl = process.env.MERCHANT_PORTAL_BASE_URL || 'https://merchant.pivota.cc';
const apiBaseUrl =
  process.env.MERCHANT_API_BASE_URL || 'https://web-production-fedb.up.railway.app';
const email = process.env.MERCHANT_EMAIL;
const password = process.env.MERCHANT_PASSWORD;

if (!email || !password) {
  console.error('Missing MERCHANT_EMAIL or MERCHANT_PASSWORD');
  process.exit(1);
}

function assertField(obj, path, label) {
  const value = path.split('.').reduce((current, key) => current?.[key], obj);
  if (value === undefined || value === null) {
    throw new Error(`Missing required field for ${label}: ${path}`);
  }
}

function unwrap(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data) {
    return payload.data;
  }
  return payload;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${url} -> ${JSON.stringify(json)}`);
  }

  return json;
}

async function main() {
  const loginPayload = await requestJson(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const token = loginPayload?.token;
  const merchantId = loginPayload?.user?.merchant_id;

  if (!token || !merchantId) {
    throw new Error('Login did not return merchant token and merchant_id');
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const checks = [
    {
      label: 'readiness optimization',
      url: `${apiBaseUrl}/merchant/readiness/optimization`,
      headers: authHeaders,
      required: ['readiness_summary', 'product_queue', 'quality_coverage'],
    },
    {
      label: 'dashboard stats',
      url: `${apiBaseUrl}/merchant/dashboard/stats`,
      headers: authHeaders,
      required: ['total_orders', 'total_revenue', 'total_customers', 'total_products', 'recent_orders'],
    },
    {
      label: 'analytics trends',
      url: `${apiBaseUrl}/merchant/analytics/trends?metric=gmv&range=30d&interval=day&compare=true`,
      headers: authHeaders,
      required: ['series', 'comparison_series'],
    },
    {
      label: 'profile',
      url: `${apiBaseUrl}/merchant/profile`,
      headers: authHeaders,
      required: ['business_name', 'contact_email', 'merchant_id'],
    },
    {
      label: 'quality summary',
      url: `${apiBaseUrl}/merchant/products/quality/summary`,
      headers: authHeaders,
      required: ['total_products', 'coverage_state'],
    },
    {
      label: 'connected stores',
      url: `${apiBaseUrl}/merchant/${merchantId}/integrations`,
      headers: authHeaders,
      required: ['stores'],
    },
    {
      label: 'psps',
      url: `${apiBaseUrl}/merchant/${merchantId}/psps`,
      headers: authHeaders,
      required: ['psps'],
    },
    {
      label: 'promotions proxy',
      url: `${portalBaseUrl}/api/portal/promotions`,
      headers: {
        ...authHeaders,
        'X-Merchant-Id': merchantId,
      },
      required: ['promotions'],
    },
  ];

  for (const check of checks) {
    const payload = unwrap(await requestJson(check.url, { headers: check.headers }));
    for (const field of check.required) {
      assertField(payload, field, check.label);
    }
    console.log(`PASS ${check.label}`);
  }
}

main().catch((error) => {
  console.error(`Merchant smoke check failed: ${error.message}`);
  process.exit(1);
});
