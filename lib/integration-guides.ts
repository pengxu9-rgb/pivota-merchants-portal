import type { MerchantPortalLanguage } from "@/lib/i18n/merchant-portal";

export type IntegrationGuideKey =
  | "shopify"
  | "wix"
  | "woocommerce"
  | "bigcommerce"
  | "prestashop"
  | "stripe"
  | "adyen"
  | "checkout";

export type IntegrationGuideCategory = "sales_channels" | "payment_setup";

export type IntegrationGuideLink = {
  label: string;
  href: string;
};

export type IntegrationGuide = {
  key: IntegrationGuideKey;
  category: IntegrationGuideCategory;
  name: string;
  title: string;
  summary: string;
  requiredFields: string[];
  fieldMappings: string[];
  prerequisites: string[];
  steps: string[];
  pitfalls: string[];
  validationNotes: string[];
  optionalNotes?: string[];
  officialLinks: IntegrationGuideLink[];
};

export type IntegrationGuideUiText = {
  helpLabel: string;
  chooserTitle: Record<IntegrationGuideCategory, string>;
  chooserDescription: Record<IntegrationGuideCategory, string>;
  viewGuide: string;
  close: string;
  sections: {
    requiredFields: string;
    fieldMappings: string;
    prerequisites: string;
    steps: string;
    pitfalls: string;
    validationNotes: string;
    optionalNotes: string;
    officialLinks: string;
  };
};

export const SALES_CHANNEL_GUIDE_KEYS: IntegrationGuideKey[] = [
  "shopify",
  "wix",
  "woocommerce",
  "bigcommerce",
  "prestashop",
];

export const PAYMENT_SETUP_GUIDE_KEYS: IntegrationGuideKey[] = [
  "stripe",
  "adyen",
  "checkout",
];

export const INTEGRATION_GUIDE_KEYS = [
  ...SALES_CHANNEL_GUIDE_KEYS,
  ...PAYMENT_SETUP_GUIDE_KEYS,
] as const;

export const normalizeIntegrationGuideKey = (
  value?: string | null,
): IntegrationGuideKey | null => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(".com", "")
    .replace(/[^a-z0-9]/g, "");

  if (normalized === "woocommerce") return "woocommerce";
  if (normalized === "bigcommerce") return "bigcommerce";
  if (normalized === "prestashop") return "prestashop";
  if (normalized === "checkout") return "checkout";
  if (normalized === "shopify") return "shopify";
  if (normalized === "stripe") return "stripe";
  if (normalized === "adyen") return "adyen";
  if (normalized === "wix") return "wix";

  return null;
};

const officialLinks: Record<IntegrationGuideKey, IntegrationGuideLink[]> = {
  shopify: [
    {
      label: "Shopify custom apps",
      href: "https://help.shopify.com/en/manual/apps/custom-apps",
    },
    {
      label: "Shopify admin custom app access tokens",
      href: "https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin",
    },
  ],
  wix: [
    {
      label: "Wix API keys",
      href: "https://dev.wix.com/docs/api-reference/articles/authentication/about-api-keys",
    },
    {
      label: "Wix Sites API",
      href: "https://dev.wix.com/docs/api-reference/account-level/sites/sites/introduction",
    },
  ],
  woocommerce: [
    {
      label: "WooCommerce REST API",
      href: "https://woocommerce.com/document/woocommerce-rest-api/",
    },
    {
      label: "WooCommerce REST API docs",
      href: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
    },
  ],
  bigcommerce: [
    {
      label: "BigCommerce API authentication",
      href: "https://docs.bigcommerce.com/docs/start/authentication",
    },
  ],
  prestashop: [
    {
      label: "PrestaShop webservice access",
      href: "https://devdocs.prestashop-project.org/8/webservice/tutorials/creating-access/",
    },
    {
      label: "PrestaShop webservice settings",
      href: "https://docs.prestashop-project.org/v.8-documentation/user-guide/configuring-shop/advanced-parameters/webservice",
    },
  ],
  stripe: [
    {
      label: "Stripe API keys",
      href: "https://docs.stripe.com/keys",
    },
  ],
  adyen: [
    {
      label: "Adyen client-side authentication",
      href: "https://docs.adyen.com/development-resources/client-side-authentication/",
    },
    {
      label: "Adyen API credentials",
      href: "https://docs.adyen.com/api-explorer/Management/latest/overview",
    },
  ],
  checkout: [
    {
      label: "Checkout.com processing channel ID",
      href: "https://support.checkout.com/hc/en-us/articles/21324743204498-Find-the-processing-channel-ID-processing-channel-id-in-the-Dashboard",
    },
  ],
};

const enGuides: Record<IntegrationGuideKey, IntegrationGuide> = {
  shopify: {
    key: "shopify",
    category: "sales_channels",
    name: "Shopify",
    title: "Connect Shopify with a custom app",
    summary:
      "Pivota connects to Shopify using your MyShopify domain and app credentials from an admin-created custom app. This lets Pivota validate the store, sync catalog data, and prepare order and webhook flows without replacing Shopify.",
    requiredFields: [
      "Store domain, for example mystore.myshopify.com",
      "Client ID from the Shopify app API credentials page",
      "Client Secret from the same Shopify app API credentials page",
    ],
    fieldMappings: [
      "Shopify API key maps to Pivota Client ID.",
      "Shopify API secret key maps to Pivota Client Secret.",
      "The store domain must be the canonical myshopify.com domain, not only the public brand domain.",
    ],
    prerequisites: [
      "You need Shopify admin access with permission to create or manage custom apps.",
      "Custom app development must be enabled for the store.",
      "Use the same store environment you want Pivota to sync and validate.",
    ],
    steps: [
      "Open Shopify Admin > Settings > Apps and sales channels > Develop apps.",
      "Create a new custom app for Pivota, or open the existing Pivota app if one already exists.",
      "Configure Admin API scopes: read_products, read_orders, read_fulfillments, write_orders, write_webhooks, and read_discounts.",
      "Install the app in the Shopify store after scopes are configured.",
      "Open the app's API credentials page and copy the API key and API secret key.",
      "Paste the API key into Pivota Client ID and the API secret key into Pivota Client Secret.",
      "Paste the MyShopify domain into Store Domain, then connect.",
    ],
    pitfalls: [
      "Do not paste a storefront domain like brand.com if the MyShopify domain is available.",
      "If scopes are changed later, reinstall or refresh the app credentials before reconnecting.",
      "Missing read_discounts can block discount and promotion reads even when product sync works.",
    ],
    validationNotes: [
      "Pivota exchanges the client ID and client secret for an Admin access token, then checks Shopify Admin API /shop.json.",
      "If the Storefront API token can be created from the Admin token, Pivota stores it for pricing and checkout-related flows.",
      "If Shopify returns 401 or 403, recheck the app credentials, scopes, and store ownership.",
    ],
    optionalNotes: [
      "If the Pivota app OAuth mode is enabled for your account, the portal can generate a one-time Shopify install link. The custom app steps remain the manual fallback.",
    ],
    officialLinks: officialLinks.shopify,
  },
  wix: {
    key: "wix",
    category: "sales_channels",
    name: "Wix",
    title: "Connect Wix with a site ID and API key",
    summary:
      "Pivota connects to Wix with a site ID and API key so product data can be validated through Wix Stores APIs.",
    requiredFields: [
      "Site ID for the Wix site",
      "API key generated by the Wix site owner or account owner",
      "Optional store name for display inside Pivota",
    ],
    fieldMappings: [
      "Wix Site ID maps to Pivota Site ID.",
      "Wix API key maps to Pivota API Key.",
      "Store Name is optional and only controls the display name in the portal.",
    ],
    prerequisites: [
      "The Wix site must have Wix Stores enabled.",
      "The API key must be generated by an owner with access to the target site.",
      "The API key needs product or store catalog access for the site.",
    ],
    steps: [
      "Open the Wix dashboard for the target store.",
      "Find the site ID from the dashboard URL after /dashboard/, or use Wix developer tools that show site details.",
      "Open Wix API Keys Manager and create an API key for the account or site.",
      "Grant the key access needed to read Wix Stores product data.",
      "Paste the Site ID and API Key into Pivota, add an optional store name, then connect.",
    ],
    pitfalls: [
      "Do not use the public site URL as the site ID.",
      "A key created by the wrong account or without access to the site can validate poorly or fail product queries.",
      "Keep test and production Wix sites separate when copying credentials.",
    ],
    validationNotes: [
      "Pivota sends a small Wix Stores products query using the API key and site ID.",
      "If Wix rejects the request, recheck ownership, site ID, and API key permissions.",
    ],
    officialLinks: officialLinks.wix,
  },
  woocommerce: {
    key: "woocommerce",
    category: "sales_channels",
    name: "WooCommerce",
    title: "Connect WooCommerce with REST API keys",
    summary:
      "Pivota connects to WooCommerce using the store URL, consumer key, and consumer secret generated from WooCommerce REST API settings.",
    requiredFields: [
      "Store URL, for example https://store.com",
      "Consumer Key starting with ck_",
      "Consumer Secret starting with cs_",
    ],
    fieldMappings: [
      "WooCommerce Consumer Key maps to Pivota Consumer Key.",
      "WooCommerce Consumer Secret maps to Pivota Consumer Secret.",
      "The store URL should be the canonical WordPress/WooCommerce domain.",
    ],
    prerequisites: [
      "WooCommerce REST API must be available on the WordPress site.",
      "Create the key for a user with access to products and orders.",
      "Set permissions to Read/Write because Pivota reads products and can write platform orders.",
    ],
    steps: [
      "Open WordPress Admin > WooCommerce > Settings > Advanced > REST API.",
      "Select Add key.",
      "Choose a user with merchant-level WooCommerce access.",
      "Set Permissions to Read/Write.",
      "Generate the API key and copy the Consumer Key and Consumer Secret immediately.",
      "Paste Store URL, Consumer Key, and Consumer Secret into Pivota, then connect.",
    ],
    pitfalls: [
      "Read-only keys can pass some reads but block later order writeback paths.",
      "Do not include an admin path such as /wp-admin in the Store URL.",
      "Some security plugins block REST requests; allow WooCommerce REST API traffic if validation fails.",
    ],
    validationNotes: [
      "Pivota validates the URL and credentials, then checks /wp-json/wc/v3/system_status.",
      "A 401 or 403 usually means the key, secret, user, or permissions are wrong.",
    ],
    officialLinks: officialLinks.woocommerce,
  },
  bigcommerce: {
    key: "bigcommerce",
    category: "sales_channels",
    name: "BigCommerce",
    title: "Connect BigCommerce with a store API account",
    summary:
      "Pivota connects to BigCommerce with the store hash and access token from a store-level API account. Client ID is optional in the current portal form.",
    requiredFields: [
      "Store Hash, for example abc123def",
      "Access Token from the BigCommerce API account",
      "Optional Client ID from the same API account",
    ],
    fieldMappings: [
      "BigCommerce store hash maps to Pivota Store Hash.",
      "BigCommerce access token maps to Pivota Access Token.",
      "BigCommerce client ID maps to Pivota Client ID and is optional in this portal flow.",
      "Pivota does not ask for the BigCommerce client secret in the current form.",
    ],
    prerequisites: [
      "You need BigCommerce admin access to create store API accounts.",
      "Create a store-level API account for the target store.",
      "Grant catalog/product read access and order access matching the merchant path you want to run.",
    ],
    steps: [
      "Open BigCommerce Admin > Settings > API Accounts.",
      "Create a store API account for Pivota.",
      "Grant the API account the catalog and order scopes needed for product sync and order execution.",
      "Copy the Store Hash, Access Token, and Client ID from the generated API credentials.",
      "Paste Store Hash and Access Token into Pivota. Add Client ID if available, then connect.",
    ],
    pitfalls: [
      "The store hash is not the full storefront URL.",
      "Save the access token when BigCommerce shows it; it may not be shown again.",
      "A token without catalog or order scope can pass partial checks but fail deeper flows.",
    ],
    validationNotes: [
      "Pivota validates the store hash format and checks the BigCommerce store endpoint with the access token.",
      "For deeper order paths, Pivota uses the same credential family against product and order endpoints.",
    ],
    officialLinks: officialLinks.bigcommerce,
  },
  prestashop: {
    key: "prestashop",
    category: "sales_channels",
    name: "PrestaShop",
    title: "Connect PrestaShop with a Webservice key",
    summary:
      "Pivota connects to PrestaShop using the store URL and Webservice API key created in Advanced Parameters.",
    requiredFields: [
      "Store URL, for example https://store.com",
      "Webservice API key",
    ],
    fieldMappings: [
      "PrestaShop Webservice key maps to Pivota API Key.",
      "The store URL should be the base storefront URL, not the admin URL.",
    ],
    prerequisites: [
      "PrestaShop Webservice must be enabled.",
      "Create a dedicated key for Pivota instead of reusing a personal admin credential.",
      "Grant read access for shop and catalog resources needed for connection validation.",
    ],
    steps: [
      "Open PrestaShop Admin > Advanced Parameters > Webservice.",
      "Enable Webservice if it is not already enabled.",
      "Add a new Webservice key for Pivota.",
      "Grant the key the resources required for connection validation and catalog access.",
      "Copy the generated key and paste it into Pivota with the Store URL, then connect.",
    ],
    pitfalls: [
      "The Webservice toggle must be enabled before keys can work.",
      "Do not paste the PrestaShop back-office admin URL as the Store URL.",
      "Permissions are resource-based; a key with too few resources may validate poorly later.",
    ],
    validationNotes: [
      "Pivota checks the PrestaShop /api endpoint with Basic auth using the key.",
      "If the root API check fails, confirm Webservice is enabled and the key is active.",
    ],
    officialLinks: officialLinks.prestashop,
  },
  stripe: {
    key: "stripe",
    category: "payment_setup",
    name: "Stripe",
    title: "Connect Stripe for PaymentIntent execution",
    summary:
      "Pivota connects Stripe with the secret key and publishable key for the environment you choose. The current runtime uses PaymentIntent-style execution.",
    requiredFields: [
      "Secret key, sk_test_ or sk_live_",
      "Publishable key, pk_test_ or pk_live_",
      "Optional connected account ID for Stripe Connect",
    ],
    fieldMappings: [
      "Stripe Secret key maps to Pivota Secret key.",
      "Stripe Publishable key maps to Pivota Publishable key.",
      "Stripe connected account ID maps to Pivota Connected account ID and is optional.",
    ],
    prerequisites: [
      "Choose Test or Live in Pivota to match the Stripe keys you paste.",
      "Use restricted keys only if they allow the PaymentIntent and payment method actions your flow needs.",
      "For Stripe Connect, know whether charges should run on a connected account.",
    ],
    steps: [
      "Open Stripe Dashboard > Developers > API keys.",
      "Choose the correct mode: test or live.",
      "Copy the secret key and publishable key for the same mode.",
      "If using Stripe Connect, copy the connected account ID only when this merchant should charge through that account.",
      "Paste the keys into Pivota, choose the matching environment, then connect.",
    ],
    pitfalls: [
      "Do not mix test secret keys with live publishable keys.",
      "Never paste a secret key into client-side code or public documents.",
      "Leave Connected account ID blank unless Stripe Connect is part of this merchant setup.",
    ],
    validationNotes: [
      "Pivota stores the key family and checks live readiness separately from whether the processor row is active.",
      "The portal requires the publishable key because the PaymentIntent flow needs a client-side Stripe key.",
    ],
    officialLinks: officialLinks.stripe,
  },
  adyen: {
    key: "adyen",
    category: "payment_setup",
    name: "Adyen",
    title: "Connect Adyen with API key, merchant account, and client key",
    summary:
      "Pivota connects Adyen with a server API key, merchant account, and client key from the same environment.",
    requiredFields: [
      "API key from an Adyen API credential",
      "Merchant account",
      "Client key generated for the API credential",
    ],
    fieldMappings: [
      "Adyen API key maps to Pivota API key.",
      "Adyen merchantAccount maps to Pivota Merchant account.",
      "Adyen Client key maps to Pivota Client key.",
    ],
    prerequisites: [
      "Use the Adyen Customer Area for the same test or live environment you select in Pivota.",
      "Use an API credential with access to the merchant account.",
      "Add allowed origins for the domains that will render payment components.",
    ],
    steps: [
      "Open Adyen Customer Area > Developers > API credentials.",
      "Create or select the Web service user/API credential for this integration.",
      "Generate or copy the API key from Server settings.",
      "Open Client settings > Authentication and generate or copy the Client key.",
      "Add allowed origins for the merchant domains and Pivota-controlled payment surfaces that will use the client key.",
      "Copy the merchantAccount value, paste all three fields into Pivota, choose the matching environment, then connect.",
    ],
    pitfalls: [
      "Client key and merchant account are environment-specific.",
      "Allowed origins must include the actual browser origin used by the payment surface.",
      "An API key can exist but still lack access to the merchant account.",
    ],
    validationNotes: [
      "Pivota requires merchant account and client key before the Adyen setup can be considered usable.",
      "Live readiness is shown separately after connection so active credentials do not imply every payment path is ready.",
    ],
    officialLinks: officialLinks.adyen,
  },
  checkout: {
    key: "checkout",
    category: "payment_setup",
    name: "Checkout.com",
    title: "Connect Checkout.com with keys and processing channel",
    summary:
      "Pivota connects Checkout.com with the secret key, public key, and processing channel ID used by the payment session path.",
    requiredFields: [
      "Secret key, usually sk_...",
      "Public key, usually pk_...",
      "Processing channel ID, usually pc_...",
    ],
    fieldMappings: [
      "Checkout.com secret key maps to Pivota Secret key.",
      "Checkout.com public key maps to Pivota Public key.",
      "Checkout.com processing_channel_id maps to Pivota Processing channel ID.",
    ],
    prerequisites: [
      "Use keys from the same test or live environment selected in Pivota.",
      "Use a key associated with the processing channel the merchant wants to run.",
      "Follow Checkout.com's Payment Sessions key-scope recommendations for the credential.",
    ],
    steps: [
      "Open Checkout.com Dashboard > Developers > Keys.",
      "Create a new key or open an existing key for the target environment.",
      "Copy the secret key and public key.",
      "Open the key details and copy the associated processing channel ID. It starts with pc_.",
      "Paste all three values into Pivota, choose the matching environment, then connect.",
    ],
    pitfalls: [
      "Do not use a processing channel from a different entity or environment.",
      "Do not mix sandbox and production keys.",
      "A public key alone is not enough; Pivota also needs the secret key and processing channel ID.",
    ],
    validationNotes: [
      "Pivota requires processing channel ID and public key before the Checkout.com setup can be used by payment sessions.",
      "Live readiness is shown separately from whether the processor is active.",
    ],
    officialLinks: officialLinks.checkout,
  },
};

const zhGuides: Record<IntegrationGuideKey, IntegrationGuide> = {
  shopify: {
    ...enGuides.shopify,
    title: "通过 custom app 连接 Shopify",
    summary:
      "Pivota 使用 MyShopify 域名和 Shopify 后台创建的 custom app 凭据连接店铺，用于验证店铺、同步目录，并为订单和 webhook 流程做准备，不替代 Shopify。",
    requiredFields: ["店铺域名，例如 mystore.myshopify.com", "Shopify app API credentials 页面里的 Client ID", "同一个 Shopify app API credentials 页面里的 Client Secret"],
    fieldMappings: ["Shopify API key 对应 Pivota Client ID。", "Shopify API secret key 对应 Pivota Client Secret。", "店铺域名应使用 myshopify.com 域名，而不只是品牌官网域名。"],
    prerequisites: ["你需要有权限创建或管理 Shopify custom app。", "店铺需要启用 custom app development。", "请使用你希望 Pivota 同步和验证的同一个店铺环境。"],
    steps: ["打开 Shopify Admin > Settings > Apps and sales channels > Develop apps。", "为 Pivota 创建一个 custom app，或打开已有的 Pivota app。", "配置 Admin API scopes：read_products、read_orders、read_fulfillments、write_orders、write_webhooks、read_discounts。", "配置完成后把 app 安装到 Shopify 店铺。", "打开 app 的 API credentials 页面，复制 API key 和 API secret key。", "把 API key 填入 Pivota Client ID，把 API secret key 填入 Pivota Client Secret。", "把 MyShopify 域名填入 Store Domain，然后连接。"],
    pitfalls: ["如果有 MyShopify 域名，不要只填 brand.com 这类品牌官网域名。", "后续如果改过 scopes，需要重新安装或刷新 app 凭据后再 reconnect。", "缺少 read_discounts 时，即使商品同步正常，也可能无法读取折扣和促销。"],
    validationNotes: ["Pivota 会用 client ID 和 client secret 换取 Admin access token，然后检查 Shopify Admin API /shop.json。", "如果能通过 Admin token 创建 Storefront API token，Pivota 会保存它用于定价和 checkout 相关流程。", "如果 Shopify 返回 401 或 403，请重新检查 app 凭据、scopes 和店铺归属。"],
    optionalNotes: ["如果你的账号启用了 Pivota app OAuth 模式，portal 可以生成一次性 Shopify install link。custom app 步骤仍然是手动 fallback。"],
  },
  wix: {
    ...enGuides.wix,
    title: "用 Site ID 和 API key 连接 Wix",
    summary: "Pivota 使用 Wix Site ID 和 API key 连接 Wix，以便通过 Wix Stores API 验证商品数据。",
    requiredFields: ["Wix Site ID", "由 Wix site owner 或 account owner 生成的 API key", "可选的 Store Name，用于 Pivota 内显示"],
    fieldMappings: ["Wix Site ID 对应 Pivota Site ID。", "Wix API key 对应 Pivota API Key。", "Store Name 是可选显示名。"],
    prerequisites: ["Wix 站点需要启用 Wix Stores。", "API key 必须由有目标站点权限的 owner 生成。", "API key 需要有读取产品或商店目录的权限。"],
    steps: ["打开目标店铺的 Wix dashboard。", "从 dashboard URL 的 /dashboard/ 后面找到 site ID，或通过 Wix developer tools 查看 site details。", "打开 Wix API Keys Manager，为账号或站点创建 API key。", "给 key 授权读取 Wix Stores 商品数据所需权限。", "把 Site ID 和 API Key 填入 Pivota，可选填 Store Name，然后连接。"],
    pitfalls: ["不要把 public site URL 当作 site ID。", "错误账号生成或没有目标站点权限的 key 可能导致验证或商品查询失败。", "复制凭据时请区分测试站点和生产站点。"],
    validationNotes: ["Pivota 会用 API key 和 site ID 发起一个小的 Wix Stores products query。", "如果 Wix 拒绝请求，请检查 owner、site ID 和 API key 权限。"],
  },
  woocommerce: {
    ...enGuides.woocommerce,
    title: "用 REST API keys 连接 WooCommerce",
    summary: "Pivota 使用 WooCommerce REST API 设置中生成的 Store URL、Consumer Key 和 Consumer Secret 连接店铺。",
    requiredFields: ["Store URL，例如 https://store.com", "以 ck_ 开头的 Consumer Key", "以 cs_ 开头的 Consumer Secret"],
    fieldMappings: ["WooCommerce Consumer Key 对应 Pivota Consumer Key。", "WooCommerce Consumer Secret 对应 Pivota Consumer Secret。", "Store URL 应使用标准 WordPress/WooCommerce 域名。"],
    prerequisites: ["WordPress 站点需要可用 WooCommerce REST API。", "为具备商品和订单访问权限的用户创建 key。", "Permissions 选择 Read/Write，因为 Pivota 会读取商品，也可能写入 platform orders。"],
    steps: ["打开 WordPress Admin > WooCommerce > Settings > Advanced > REST API。", "选择 Add key。", "选择有 merchant-level WooCommerce 权限的用户。", "Permissions 选择 Read/Write。", "Generate API Key 后立即复制 Consumer Key 和 Consumer Secret。", "把 Store URL、Consumer Key 和 Consumer Secret 填入 Pivota，然后连接。"],
    pitfalls: ["Read-only key 可能能读取部分数据，但会阻塞后续订单写回路径。", "Store URL 不要包含 /wp-admin。", "部分安全插件会拦截 REST 请求；验证失败时请允许 WooCommerce REST API 流量。"],
    validationNotes: ["Pivota 会验证 URL 和凭据，然后检查 /wp-json/wc/v3/system_status。", "401 或 403 通常表示 key、secret、用户或权限配置错误。"],
  },
  bigcommerce: {
    ...enGuides.bigcommerce,
    title: "用 store API account 连接 BigCommerce",
    summary: "Pivota 使用 BigCommerce store-level API account 的 store hash 和 access token 连接店铺。当前 portal 表单中 Client ID 是可选项。",
    requiredFields: ["Store Hash，例如 abc123def", "BigCommerce API account 的 Access Token", "同一个 API account 的可选 Client ID"],
    fieldMappings: ["BigCommerce store hash 对应 Pivota Store Hash。", "BigCommerce access token 对应 Pivota Access Token。", "BigCommerce client ID 对应 Pivota Client ID，在当前流程中是可选。", "当前 Pivota 表单不需要 BigCommerce client secret。"],
    prerequisites: ["你需要 BigCommerce admin 权限来创建 store API account。", "为目标店铺创建 store-level API account。", "按你要运行的 merchant path 授权 catalog/product read 和 order access。"],
    steps: ["打开 BigCommerce Admin > Settings > API Accounts。", "为 Pivota 创建 store API account。", "给 API account 授权 product sync 和 order execution 所需 catalog/order scopes。", "复制生成的 Store Hash、Access Token 和 Client ID。", "把 Store Hash 和 Access Token 填入 Pivota；如有 Client ID 也填入，然后连接。"],
    pitfalls: ["Store Hash 不是完整 storefront URL。", "BigCommerce 显示 access token 时请保存，它之后可能不会再次显示。", "没有 catalog 或 order scope 的 token 可能通过部分检查，但会在更深流程失败。"],
    validationNotes: ["Pivota 会验证 store hash 格式，并用 access token 检查 BigCommerce store endpoint。", "更深订单路径会继续使用同一组凭据访问 product 和 order endpoints。"],
  },
  prestashop: {
    ...enGuides.prestashop,
    title: "用 Webservice key 连接 PrestaShop",
    summary: "Pivota 使用 PrestaShop Advanced Parameters 中创建的 Webservice API key 和 Store URL 连接店铺。",
    requiredFields: ["Store URL，例如 https://store.com", "Webservice API key"],
    fieldMappings: ["PrestaShop Webservice key 对应 Pivota API Key。", "Store URL 应该是基础 storefront URL，不是后台 admin URL。"],
    prerequisites: ["PrestaShop Webservice 必须启用。", "为 Pivota 创建专用 key，不要复用个人 admin 凭据。", "为连接验证和目录访问所需 shop/catalog resources 授权 read access。"],
    steps: ["打开 PrestaShop Admin > Advanced Parameters > Webservice。", "如果还未启用，先启用 Webservice。", "为 Pivota 添加新的 Webservice key。", "给 key 授权连接验证和目录访问所需资源。", "复制生成的 key，和 Store URL 一起填入 Pivota，然后连接。"],
    pitfalls: ["Webservice toggle 必须启用，key 才能工作。", "不要把 PrestaShop back-office admin URL 填为 Store URL。", "权限是按 resource 控制的；权限过少的 key 后续可能验证不完整。"],
    validationNotes: ["Pivota 会用该 key 通过 Basic auth 检查 PrestaShop /api endpoint。", "如果 root API 检查失败，请确认 Webservice 已启用且 key 有效。"],
  },
  stripe: {
    ...enGuides.stripe,
    title: "连接 Stripe 用于 PaymentIntent execution",
    summary: "Pivota 使用你选择环境对应的 Stripe secret key 和 publishable key 连接。当前 runtime 使用 PaymentIntent 风格的执行路径。",
    requiredFields: ["Secret key，sk_test_ 或 sk_live_", "Publishable key，pk_test_ 或 pk_live_", "Stripe Connect 场景下可选 connected account ID"],
    fieldMappings: ["Stripe Secret key 对应 Pivota Secret key。", "Stripe Publishable key 对应 Pivota Publishable key。", "Stripe connected account ID 对应 Pivota Connected account ID，是可选项。"],
    prerequisites: ["Pivota 里选择的 Test 或 Live 必须和 Stripe keys 一致。", "如果使用 restricted key，必须允许该流程需要的 PaymentIntent 和 payment method actions。", "如果使用 Stripe Connect，需要确认是否通过 connected account 收款。"],
    steps: ["打开 Stripe Dashboard > Developers > API keys。", "选择正确模式：test 或 live。", "复制同一模式下的 secret key 和 publishable key。", "如果使用 Stripe Connect，只在该 merchant 应该通过 connected account 收款时复制 connected account ID。", "把 keys 填入 Pivota，选择匹配环境，然后连接。"],
    pitfalls: ["不要混用 test secret key 和 live publishable key。", "不要把 secret key 放到客户端代码或公开文档里。", "除非当前 merchant 使用 Stripe Connect，否则 Connected account ID 留空。"],
    validationNotes: ["Pivota 会保存 key family，并把 live readiness 和 processor row 是否 active 分开显示。", "portal 要求 publishable key，因为 PaymentIntent flow 需要客户端 Stripe key。"],
  },
  adyen: {
    ...enGuides.adyen,
    title: "用 API key、merchant account 和 client key 连接 Adyen",
    summary: "Pivota 使用同一环境下的 Adyen server API key、merchant account 和 client key 连接。",
    requiredFields: ["Adyen API credential 的 API key", "Merchant account", "同一 API credential 生成的 Client key"],
    fieldMappings: ["Adyen API key 对应 Pivota API key。", "Adyen merchantAccount 对应 Pivota Merchant account。", "Adyen Client key 对应 Pivota Client key。"],
    prerequisites: ["使用与 Pivota 中 Test/Live 选择相同的 Adyen Customer Area。", "API credential 需要访问目标 merchant account。", "为会渲染 payment components 的域名添加 allowed origins。"],
    steps: ["打开 Adyen Customer Area > Developers > API credentials。", "创建或选择用于该集成的 Web service user/API credential。", "在 Server settings 中生成或复制 API key。", "打开 Client settings > Authentication，生成或复制 Client key。", "为 merchant 域名和 Pivota-controlled payment surfaces 添加 allowed origins。", "复制 merchantAccount，把三个字段填入 Pivota，选择匹配环境，然后连接。"],
    pitfalls: ["Client key 和 merchant account 都区分环境。", "Allowed origins 必须包含实际渲染支付页面的 browser origin。", "API key 可能存在，但仍然没有目标 merchant account 权限。"],
    validationNotes: ["Pivota 要求 merchant account 和 client key 都存在，Adyen setup 才能进入可用状态。", "连接后 live readiness 会单独展示，active credentials 不代表所有支付路径都已就绪。"],
  },
  checkout: {
    ...enGuides.checkout,
    title: "用 keys 和 processing channel 连接 Checkout.com",
    summary: "Pivota 使用 Checkout.com payment session 路径所需的 secret key、public key 和 processing channel ID 连接。",
    requiredFields: ["Secret key，通常是 sk_...", "Public key，通常是 pk_...", "Processing channel ID，通常是 pc_..."],
    fieldMappings: ["Checkout.com secret key 对应 Pivota Secret key。", "Checkout.com public key 对应 Pivota Public key。", "Checkout.com processing_channel_id 对应 Pivota Processing channel ID。"],
    prerequisites: ["使用与 Pivota 中选择的 test 或 live 环境一致的 keys。", "key 必须关联 merchant 要运行的 processing channel。", "按 Checkout.com Payment Sessions 建议配置 key scopes。"],
    steps: ["打开 Checkout.com Dashboard > Developers > Keys。", "为目标环境创建新 key，或打开已有 key。", "复制 secret key 和 public key。", "打开 key details，复制关联的 processing channel ID，值以 pc_ 开头。", "把三个值填入 Pivota，选择匹配环境，然后连接。"],
    pitfalls: ["不要使用其他 entity 或其他环境的 processing channel。", "不要混用 sandbox 和 production keys。", "只有 public key 不够；Pivota 同时需要 secret key 和 processing channel ID。"],
    validationNotes: ["Pivota 要求 processing channel ID 和 public key 都存在，Checkout.com setup 才能用于 payment sessions。", "Live readiness 与 processor 是否 active 分开显示。"],
  },
};

const jaGuides: Record<IntegrationGuideKey, IntegrationGuide> = Object.fromEntries(
  Object.entries(enGuides).map(([key, guide]) => [
    key,
    {
      ...guide,
      summary: `${guide.name} の接続手順です。必要なフィールド、管理画面での取得場所、Pivota 側の検証方法を確認できます。`,
      prerequisites: guide.prerequisites.map((item) => `確認: ${item}`),
      steps: guide.steps.map((item) => `手順: ${item}`),
      pitfalls: guide.pitfalls.map((item) => `注意: ${item}`),
      validationNotes: guide.validationNotes.map((item) => `検証: ${item}`),
      optionalNotes: guide.optionalNotes?.map((item) => `任意: ${item}`),
    },
  ]),
) as Record<IntegrationGuideKey, IntegrationGuide>;

const koGuides: Record<IntegrationGuideKey, IntegrationGuide> = Object.fromEntries(
  Object.entries(enGuides).map(([key, guide]) => [
    key,
    {
      ...guide,
      summary: `${guide.name} 연결 가이드입니다. 필요한 필드, 외부 관리자 화면에서 찾는 위치, Pivota 검증 방식을 확인할 수 있습니다.`,
      prerequisites: guide.prerequisites.map((item) => `확인: ${item}`),
      steps: guide.steps.map((item) => `단계: ${item}`),
      pitfalls: guide.pitfalls.map((item) => `주의: ${item}`),
      validationNotes: guide.validationNotes.map((item) => `검증: ${item}`),
      optionalNotes: guide.optionalNotes?.map((item) => `선택: ${item}`),
    },
  ]),
) as Record<IntegrationGuideKey, IntegrationGuide>;

const frGuides: Record<IntegrationGuideKey, IntegrationGuide> = Object.fromEntries(
  Object.entries(enGuides).map(([key, guide]) => [
    key,
    {
      ...guide,
      summary: `Guide de connexion ${guide.name}. Il indique les champs requis, ou les trouver dans l'outil externe et comment Pivota les valide.`,
      prerequisites: guide.prerequisites.map((item) => `A verifier: ${item}`),
      steps: guide.steps.map((item) => `Etape: ${item}`),
      pitfalls: guide.pitfalls.map((item) => `Attention: ${item}`),
      validationNotes: guide.validationNotes.map((item) => `Validation: ${item}`),
      optionalNotes: guide.optionalNotes?.map((item) => `Option: ${item}`),
    },
  ]),
) as Record<IntegrationGuideKey, IntegrationGuide>;

const deGuides: Record<IntegrationGuideKey, IntegrationGuide> = Object.fromEntries(
  Object.entries(enGuides).map(([key, guide]) => [
    key,
    {
      ...guide,
      summary: `Einrichtungsanleitung fur ${guide.name}. Sie zeigt die Pflichtfelder, wo sie im externen Admin zu finden sind und wie Pivota sie validiert.`,
      prerequisites: guide.prerequisites.map((item) => `Prufen: ${item}`),
      steps: guide.steps.map((item) => `Schritt: ${item}`),
      pitfalls: guide.pitfalls.map((item) => `Achtung: ${item}`),
      validationNotes: guide.validationNotes.map((item) => `Validierung: ${item}`),
      optionalNotes: guide.optionalNotes?.map((item) => `Optional: ${item}`),
    },
  ]),
) as Record<IntegrationGuideKey, IntegrationGuide>;

export const integrationGuidesByLanguage: Record<
  MerchantPortalLanguage,
  Record<IntegrationGuideKey, IntegrationGuide>
> = {
  en: enGuides,
  "zh-CN": zhGuides,
  "ja-JP": jaGuides,
  "ko-KR": koGuides,
  "fr-FR": frGuides,
  "de-DE": deGuides,
};

export const integrationGuideUiText: Record<MerchantPortalLanguage, IntegrationGuideUiText> = {
  en: {
    helpLabel: "Open integration setup guide",
    chooserTitle: {
      sales_channels: "Choose a sales channel guide",
      payment_setup: "Choose a payment setup guide",
    },
    chooserDescription: {
      sales_channels: "Review the exact fields and platform steps before connecting a storefront.",
      payment_setup: "Review the exact PSP credentials and runtime settings before connecting a processor.",
    },
    viewGuide: "View setup guide",
    close: "Close",
    sections: {
      requiredFields: "Fields Pivota needs",
      fieldMappings: "Field mapping",
      prerequisites: "Before you start",
      steps: "Steps",
      pitfalls: "Common mistakes",
      validationNotes: "How Pivota validates it",
      optionalNotes: "Optional path",
      officialLinks: "Official references",
    },
  },
  "zh-CN": {
    helpLabel: "打开集成设置教程",
    chooserTitle: {
      sales_channels: "选择销售渠道教程",
      payment_setup: "选择支付设置教程",
    },
    chooserDescription: {
      sales_channels: "连接店铺前，先查看 Pivota 需要哪些字段，以及第三方平台里如何获取。",
      payment_setup: "连接 PSP 前，先确认需要的凭据和 runtime 设置。",
    },
    viewGuide: "查看设置教程",
    close: "关闭",
    sections: {
      requiredFields: "Pivota 需要的字段",
      fieldMappings: "字段对应关系",
      prerequisites: "开始前确认",
      steps: "操作步骤",
      pitfalls: "常见错误",
      validationNotes: "Pivota 如何验证",
      optionalNotes: "可选路径",
      officialLinks: "官方参考",
    },
  },
  "ja-JP": {
    helpLabel: "連携設定ガイドを開く",
    chooserTitle: {
      sales_channels: "販売チャネルのガイドを選択",
      payment_setup: "決済設定のガイドを選択",
    },
    chooserDescription: {
      sales_channels: "ストア連携の前に、必要なフィールドと取得場所を確認します。",
      payment_setup: "決済プロセッサ連携の前に、必要な認証情報と設定を確認します。",
    },
    viewGuide: "設定ガイドを見る",
    close: "閉じる",
    sections: {
      requiredFields: "Pivota が必要とする項目",
      fieldMappings: "フィールド対応",
      prerequisites: "開始前の確認",
      steps: "手順",
      pitfalls: "よくあるミス",
      validationNotes: "Pivota の検証方法",
      optionalNotes: "任意の方法",
      officialLinks: "公式リファレンス",
    },
  },
  "ko-KR": {
    helpLabel: "통합 설정 가이드 열기",
    chooserTitle: {
      sales_channels: "판매 채널 가이드 선택",
      payment_setup: "결제 설정 가이드 선택",
    },
    chooserDescription: {
      sales_channels: "스토어 연결 전에 필요한 필드와 위치를 확인합니다.",
      payment_setup: "결제 프로세서 연결 전에 필요한 자격 증명과 설정을 확인합니다.",
    },
    viewGuide: "설정 가이드 보기",
    close: "닫기",
    sections: {
      requiredFields: "Pivota에 필요한 필드",
      fieldMappings: "필드 매핑",
      prerequisites: "시작 전 확인",
      steps: "단계",
      pitfalls: "흔한 실수",
      validationNotes: "Pivota 검증 방식",
      optionalNotes: "선택 경로",
      officialLinks: "공식 참고 자료",
    },
  },
  "fr-FR": {
    helpLabel: "Ouvrir le guide de configuration",
    chooserTitle: {
      sales_channels: "Choisir un guide de canal de vente",
      payment_setup: "Choisir un guide de paiement",
    },
    chooserDescription: {
      sales_channels: "Verifiez les champs et les etapes avant de connecter une boutique.",
      payment_setup: "Verifiez les identifiants PSP et les reglages avant de connecter un processeur.",
    },
    viewGuide: "Voir le guide",
    close: "Fermer",
    sections: {
      requiredFields: "Champs requis par Pivota",
      fieldMappings: "Correspondance des champs",
      prerequisites: "Avant de commencer",
      steps: "Etapes",
      pitfalls: "Erreurs courantes",
      validationNotes: "Validation par Pivota",
      optionalNotes: "Chemin optionnel",
      officialLinks: "References officielles",
    },
  },
  "de-DE": {
    helpLabel: "Einrichtungsanleitung offnen",
    chooserTitle: {
      sales_channels: "Anleitung fur Vertriebskanal auswahlen",
      payment_setup: "Anleitung fur Zahlungssetup auswahlen",
    },
    chooserDescription: {
      sales_channels: "Prufen Sie die Felder und Plattformschritte, bevor Sie einen Store verbinden.",
      payment_setup: "Prufen Sie PSP-Zugangsdaten und Laufzeiteinstellungen, bevor Sie einen Prozessor verbinden.",
    },
    viewGuide: "Anleitung anzeigen",
    close: "Schliessen",
    sections: {
      requiredFields: "Felder, die Pivota benotigt",
      fieldMappings: "Feldzuordnung",
      prerequisites: "Vor dem Start",
      steps: "Schritte",
      pitfalls: "Haufige Fehler",
      validationNotes: "Wie Pivota validiert",
      optionalNotes: "Optionaler Weg",
      officialLinks: "Offizielle Referenzen",
    },
  },
};

export function getIntegrationGuide(
  language: MerchantPortalLanguage,
  guideKey: IntegrationGuideKey,
) {
  return integrationGuidesByLanguage[language]?.[guideKey] ?? enGuides[guideKey];
}

export function getIntegrationGuideUiText(language: MerchantPortalLanguage) {
  return integrationGuideUiText[language] ?? integrationGuideUiText.en;
}

