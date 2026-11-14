/** Retests are single-product scopes. Never reuse an unrelated current selection. */
export function prepareProductRetest(productKey: string, availableKeys: string[], queries: string[]) {
  if (!productKey || availableKeys.filter(k => k === productKey).length !== 1) return null;
  const questions = [...new Map(queries.map(q => q.trim()).filter(Boolean).map(q => [q.toLowerCase(), q])).values()];
  if (!questions.length || questions.length > 10) return null;
  return {skuKeys: [productKey], customPrompts: questions, consumerQuestions: ''};
}

export type SavedConsumerQuestion = {
  product_key?: string;
  query: string;
  provider: string;
  tier?: string;
  status?: string;
  prompt_contract?: string | null;
  recommendation_pilot_eligible?: boolean;
};

export function prepareConsumerAnswerRetest<Provider extends string>(
  productKey: string,
  products: { key: string; skuKey: string }[],
  saved: SavedConsumerQuestion[],
  availableProviders: readonly Provider[],
) {
  const matches = products.filter(product => product.key === productKey);
  if (!productKey || matches.length !== 1) return null;
  const skuKey = matches[0].skuKey;
  if (products.filter(product => product.skuKey === skuKey).length !== 1) return null;
  const byProvider = new Map<string, Set<string>>();
  const matchingContracts = new Set<string>();
  for (const answer of saved) {
    if (!answer || answer.product_key !== productKey || answer.tier !== 'unbranded' || answer.recommendation_pilot_eligible !== true) continue;
    if (typeof answer.query !== 'string' || !answer.query.trim() || answer.query.length > 1000 || /[\r\n]/.test(answer.query)) return null;
    // Current capture requires web search on ChatGPT. A failed question may
    // have no retained contract, so use a known match from the same provider.
    const expectedContract = answer.provider === 'chatgpt' ? 'consumer_query_openai_web_required_v2' : 'consumer_query_v1';
    if (answer.prompt_contract === expectedContract) matchingContracts.add(answer.provider);
    else if (answer.prompt_contract || answer.status !== 'provider_failed') return null;
    const questions = byProvider.get(answer.provider) ?? new Set<string>();
    questions.add(answer.query.trim());
    byProvider.set(answer.provider, questions);
  }
  const providers = availableProviders.filter(provider => byProvider.has(provider));
  if (!providers.length || providers.length !== byProvider.size || providers.some(provider => !matchingContracts.has(provider))) return null;
  const queries = Array.from(byProvider.get(providers[0]) ?? []);
  // One audit quote sends the same questions to every selected provider.
  if (queries.length > 8 || providers.some(provider => {
    const questions = byProvider.get(provider);
    return questions?.size !== queries.length || queries.some(query => !questions?.has(query));
  })) return null;
  return { skuKeys: [skuKey], queries, providers };
}
