import type { MerchantPortalLanguage } from "@/lib/i18n/merchant-portal";

type StoreFormCopy = {
  connectStore: string;
  selectPlatform: string;
  choosePlatform: string;
  storeDomain: string;
  storeDomainHint: string;
  oauthTitle: string;
  oauthDescription: string;
  customTitle: string;
  customDescription: string;
  advancedUseCustomApp: string;
  backToOneClick: string;
  clientId: string;
  clientSecret: string;
  clientIdPlaceholder: string;
  clientSecretPlaceholder: string;
  shopifyCredentialHelp: string;
  siteId: string;
  apiKey: string;
  storeNameOptional: string;
  storeNamePlaceholder: string;
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  wooCredentialHelp: string;
  storeHash: string;
  accessToken: string;
  bcClientIdOptional: string;
  prestashopCredentialHelp: string;
  cancel: string;
  connecting: string;
  redirectingToShopify: string;
  connectWithShopify: string;
  connectStoreButton: string;
  selectPlatformAlert: string;
  shopifyConnected: string;
  platformConnected: string;
  oauthStartFailed: string;
  failedPrefix: string;
  errorPrefix: string;
};

type PspFormCopy = {
  connectProvider: string;
  description: string;
  merchantId: string;
  environment: string;
  test: string;
  live: string;
  secretKey: string;
  apiKey: string;
  publishableKey: string;
  connectedAccountId: string;
  merchantAccount: string;
  processingChannelId: string;
  clientKey: string;
  publicKey: string;
  requiredFields: string;
  saving: string;
  connect: string;
  cancel: string;
  stripeNote: string;
  adyenNote: string;
  checkoutNote: string;
  connected: string;
  failedToConnect: string;
  stripeAccountPlaceholder: string;
  adyenMerchantPlaceholder: string;
  checkoutChannelPlaceholder: string;
  apiKeyPlaceholderAdyen: string;
};

const enStore: StoreFormCopy = {
  connectStore: "Connect Store",
  selectPlatform: "Select Platform",
  choosePlatform: "-- Choose Platform --",
  storeDomain: "Store Domain",
  storeDomainHint: "e.g., mystore.myshopify.com",
  oauthTitle: "Connect with Pivota (read-only) - recommended",
  oauthDescription:
    "One-click connection for catalog sync, AI-readiness, and analytics. Buyers are handed to your Shopify checkout (Shop Pay). Read-only - never changes your products or orders. No credentials needed.",
  customTitle: "Connect with a Shopify custom app",
  customDescription:
    "Create a custom app in your Shopify admin (Settings > Apps and sales channels > Develop apps), then paste its API credentials below. Pivota reads your catalog; add the write_orders scope to also complete agent checkout through your own payment processor.",
  advancedUseCustomApp: "Advanced: use your own custom app instead",
  backToOneClick: "← Use one-click Shopify connect instead",
  clientId: "Client ID",
  clientSecret: "Client Secret",
  clientIdPlaceholder: "Shopify app client ID",
  clientSecretPlaceholder: "Shopify app client secret",
  shopifyCredentialHelp:
    "Get from Shopify Admin > Apps > Develop apps > Your app > API credentials. For agent checkout with your own PSP, enable the write_orders Admin API scope. Pivota auto-refreshes the token from your client ID + secret.",
  siteId: "Site ID or Wix URL",
  apiKey: "API Key",
  storeNameOptional: "Store Name (Optional)",
  storeNamePlaceholder: "My Wix Store",
  storeUrl: "Store URL",
  consumerKey: "Consumer Key",
  consumerSecret: "Consumer Secret",
  wooCredentialHelp: "Get from WooCommerce > Settings > Advanced > REST API.",
  storeHash: "Store Hash",
  accessToken: "Access Token",
  bcClientIdOptional: "Client ID (Optional)",
  prestashopCredentialHelp: "Get from PrestaShop > Advanced Parameters > Webservice.",
  cancel: "Cancel",
  connecting: "Connecting...",
  redirectingToShopify: "Redirecting to Shopify...",
  connectWithShopify: "Connect with Shopify",
  connectStoreButton: "Connect Store",
  selectPlatformAlert: "Please select a platform",
  shopifyConnected: "Shopify store connected successfully.",
  platformConnected: "{platform} store connected successfully.",
  oauthStartFailed: "Could not start the Shopify connection. Please try again.",
  failedPrefix: "Failed",
  errorPrefix: "Error",
};

const zhStore: StoreFormCopy = {
  ...enStore,
  connectStore: "连接店铺",
  selectPlatform: "选择平台",
  choosePlatform: "-- 选择平台 --",
  storeDomain: "店铺域名",
  storeDomainHint: "例如 mystore.myshopify.com",
  oauthTitle: "使用 Pivota 连接（只读）- 推荐",
  oauthDescription: "一键连接，用于目录同步、AI-readiness 和分析。买家将被引导至你的 Shopify 结账页（Shop Pay）。只读 —— 不会更改你的商品或订单。无需凭据。",
  customTitle: "使用 Shopify custom app 连接",
  customDescription: "在 Shopify 后台创建 custom app（设置 > 应用和销售渠道 > 开发应用），然后在下方粘贴其 API 凭据。Pivota 会读取你的目录；添加 write_orders 权限即可通过自有支付处理商完成 agent checkout。",
  advancedUseCustomApp: "高级：改用你自己的 custom app",
  backToOneClick: "← 改用一键连接 Shopify",
  clientId: "Client ID",
  clientSecret: "Client Secret",
  shopifyCredentialHelp: "从 Shopify Admin > Apps > Develop apps > Your app > API credentials 获取。如需通过自有 PSP 进行 agent checkout，请启用 write_orders Admin API 权限。Pivota 会用 client ID + secret 自动轮换 token。",
  siteId: "Site ID 或 Wix URL",
  apiKey: "API Key",
  storeNameOptional: "Store Name（可选）",
  storeUrl: "Store URL",
  consumerKey: "Consumer Key",
  consumerSecret: "Consumer Secret",
  wooCredentialHelp: "从 WooCommerce > Settings > Advanced > REST API 获取。",
  storeHash: "Store Hash",
  accessToken: "Access Token",
  bcClientIdOptional: "Client ID（可选）",
  prestashopCredentialHelp: "从 PrestaShop > Advanced Parameters > Webservice 获取。",
  cancel: "取消",
  redirectingToShopify: "正在跳转到 Shopify...",
  connectWithShopify: "连接 Shopify",
  connecting: "正在连接...",
  connectStoreButton: "连接店铺",
  selectPlatformAlert: "请选择平台",
  shopifyConnected: "Shopify 店铺已连接。",
  platformConnected: "{platform} 店铺已连接。",
  oauthStartFailed: "无法启动 Shopify 连接，请重试。",
  failedPrefix: "失败",
  errorPrefix: "错误",
};

const jaStore: StoreFormCopy = {
  ...enStore,
  connectStore: "ストアを接続",
  selectPlatform: "プラットフォームを選択",
  choosePlatform: "-- プラットフォームを選択 --",
  cancel: "キャンセル",
  connecting: "接続中...",
  connectWithShopify: "Shopify と連携",
  connectStoreButton: "ストアを接続",
  selectPlatformAlert: "プラットフォームを選択してください",
  failedPrefix: "失敗",
  errorPrefix: "エラー",
};

const koStore: StoreFormCopy = {
  ...enStore,
  connectStore: "스토어 연결",
  selectPlatform: "플랫폼 선택",
  choosePlatform: "-- 플랫폼 선택 --",
  cancel: "취소",
  connecting: "연결 중...",
  connectWithShopify: "Shopify 연결",
  connectStoreButton: "스토어 연결",
  selectPlatformAlert: "플랫폼을 선택하세요",
  failedPrefix: "실패",
  errorPrefix: "오류",
};

const frStore: StoreFormCopy = {
  ...enStore,
  connectStore: "Connecter la boutique",
  selectPlatform: "Selectionner la plateforme",
  choosePlatform: "-- Choisir une plateforme --",
  cancel: "Annuler",
  connecting: "Connexion...",
  connectWithShopify: "Connecter avec Shopify",
  connectStoreButton: "Connecter la boutique",
  selectPlatformAlert: "Selectionnez une plateforme",
  failedPrefix: "Echec",
  errorPrefix: "Erreur",
};

const deStore: StoreFormCopy = {
  ...enStore,
  connectStore: "Store verbinden",
  selectPlatform: "Plattform auswahlen",
  choosePlatform: "-- Plattform auswahlen --",
  cancel: "Abbrechen",
  connecting: "Verbinden...",
  connectWithShopify: "Mit Shopify verbinden",
  connectStoreButton: "Store verbinden",
  selectPlatformAlert: "Bitte Plattform auswahlen",
  failedPrefix: "Fehlgeschlagen",
  errorPrefix: "Fehler",
};

const enPsp: PspFormCopy = {
  connectProvider: "Connect {provider}",
  description:
    "Save the real provider credentials and runtime settings used for payment initiation.",
  merchantId: "Merchant ID",
  environment: "Environment",
  test: "Test",
  live: "Live",
  secretKey: "Secret key",
  apiKey: "API key",
  publishableKey: "Publishable key",
  connectedAccountId: "Connected account ID (optional, Stripe Connect only)",
  merchantAccount: "Merchant account",
  processingChannelId: "Processing channel ID",
  clientKey: "Client key",
  publicKey: "Public key",
  requiredFields: "Please fill in all required fields",
  saving: "Saving...",
  connect: "Connect {provider}",
  cancel: "Cancel",
  stripeNote:
    "Merchant Stripe setup uses PaymentIntent and requires the merchant publishable key so agent checkout can render Stripe Elements directly.",
  adyenNote:
    "Adyen requires both merchant account and client key so the returned session can be used by the frontend.",
  checkoutNote:
    "Checkout.com requires both processing channel ID and public key so the returned payment session is usable by the frontend.",
  connected: "{provider} connected successfully.",
  failedToConnect: "Failed to connect {provider}",
  stripeAccountPlaceholder: "Leave blank unless you are using Stripe Connect",
  adyenMerchantPlaceholder: "Your Adyen merchantAccount",
  checkoutChannelPlaceholder: "pc_...",
  apiKeyPlaceholderAdyen: "AQE...",
};

const zhPsp: PspFormCopy = {
  ...enPsp,
  connectProvider: "连接 {provider}",
  description: "保存支付发起时使用的真实 provider 凭据和 runtime 设置。",
  merchantId: "Merchant ID",
  environment: "环境",
  test: "测试",
  live: "生产",
  secretKey: "Secret key",
  apiKey: "API key",
  publishableKey: "Publishable key",
  connectedAccountId: "Connected account ID（仅 Stripe Connect，可选）",
  merchantAccount: "Merchant account",
  processingChannelId: "Processing channel ID",
  clientKey: "Client key",
  publicKey: "Public key",
  requiredFields: "请填写所有必填字段",
  saving: "正在保存...",
  connect: "连接 {provider}",
  cancel: "取消",
  stripeNote: "Stripe setup 使用 PaymentIntent，并需要 merchant publishable key 来渲染 Stripe Elements。",
  adyenNote: "Adyen 需要 merchant account 和 client key，返回的 session 才能被前端使用。",
  checkoutNote: "Checkout.com 需要 processing channel ID 和 public key，payment session 才能被前端使用。",
  connected: "{provider} 已连接。",
  failedToConnect: "连接 {provider} 失败",
};

const jaPsp: PspFormCopy = { ...enPsp, cancel: "キャンセル", saving: "保存中...", requiredFields: "必須項目を入力してください" };
const koPsp: PspFormCopy = { ...enPsp, cancel: "취소", saving: "저장 중...", requiredFields: "필수 필드를 모두 입력하세요" };
const frPsp: PspFormCopy = { ...enPsp, cancel: "Annuler", saving: "Enregistrement...", requiredFields: "Renseignez tous les champs requis" };
const dePsp: PspFormCopy = { ...enPsp, cancel: "Abbrechen", saving: "Speichern...", requiredFields: "Bitte alle Pflichtfelder ausfullen" };

const storeCopyByLanguage: Record<MerchantPortalLanguage, StoreFormCopy> = {
  en: enStore,
  "zh-CN": zhStore,
  "ja-JP": jaStore,
  "ko-KR": koStore,
  "fr-FR": frStore,
  "de-DE": deStore,
};

const pspCopyByLanguage: Record<MerchantPortalLanguage, PspFormCopy> = {
  en: enPsp,
  "zh-CN": zhPsp,
  "ja-JP": jaPsp,
  "ko-KR": koPsp,
  "fr-FR": frPsp,
  "de-DE": dePsp,
};

export function getStoreFormCopy(language: MerchantPortalLanguage) {
  return storeCopyByLanguage[language] ?? enStore;
}

export function getPspFormCopy(language: MerchantPortalLanguage) {
  return pspCopyByLanguage[language] ?? enPsp;
}

export function formatIntegrationCopy(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] || "");
}
