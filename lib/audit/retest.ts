/** Retests are single-product scopes. Never reuse an unrelated current selection. */
export function prepareProductRetest(productKey: string, availableKeys: string[], queries: string[]) {
  if (!productKey || availableKeys.filter(k => k === productKey).length !== 1) return null;
  const questions = [...new Map(queries.map(q => q.trim()).filter(Boolean).map(q => [q.toLowerCase(), q])).values()];
  if (!questions.length || questions.length > 10) return null;
  return {skuKeys: [productKey], customPrompts: questions, consumerQuestions: ''};
}
