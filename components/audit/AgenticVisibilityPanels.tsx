'use client';

/**
 * The shared "how AI sees this product" stack, used by BOTH audit surfaces
 * (the url-audit PerSkuReportCard and the deeper ai-readiness PerSkuCard) so the
 * honest per-product story is identical everywhere. Answers the merchant's four
 * questions in order:
 *   1. Does AI recommend you?      → ProductCompetitivenessPanel (recommended vs findable)
 *   2. Who wins & what AI said?    → PromptEvidencePanel (verbatim answers)
 *   3. Where does AI send buyers?  → ChannelAppearancePanel
 *   4. What do I do?               → StrategicBriefPanel
 *
 * Every panel no-ops when its slice of data is absent, so this degrades cleanly
 * on catalog audits that didn't probe discovery.
 */

import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';
import { ProductCompetitivenessPanel } from './ProductCompetitivenessPanel';
import { PromptEvidencePanel } from './PromptEvidencePanel';
import { ChannelAppearancePanel } from './ChannelAppearancePanel';
import { StrategicBriefPanel } from './StrategicBriefPanel';
import { AskAboutThis } from './AskAboutThis';

export function AgenticVisibilityPanels({
  report,
  runId,
}: {
  report: AgentCenterPerSkuReport;
  // When present, AskAboutThis renders the freeform "ask anything" box (it needs
  // a completed run to ground the answer against).
  runId?: string | null;
}) {
  return (
    <>
      <ProductCompetitivenessPanel report={report} />
      <PromptEvidencePanel report={report} />
      <ChannelAppearancePanel report={report} />
      <StrategicBriefPanel report={report} />
      <AskAboutThis report={report} runId={runId} />
    </>
  );
}
