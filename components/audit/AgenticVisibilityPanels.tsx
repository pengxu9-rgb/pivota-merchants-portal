'use client';

/**
 * The shared "how AI sees this product" stack, used by BOTH audit surfaces
 * (the url-audit PerSkuReportCard and the deeper ai-readiness PerSkuCard) so the
 * honest per-product story is identical everywhere. Answers the merchant's
 * questions in priority order:
 *   1. Does AI recommend you?      → ProductCompetitivenessPanel (recommended vs findable)
 *   2. What do I do, per engine?   → EnginePlaybookPanel (Win Gemini / Win ChatGPT)
 *   3. Why do competitors win?     → CompetitorIntelPanel + PromptEvidencePanel (verbatim)
 *   4. Where does AI send buyers?  → ChannelAppearancePanel
 *   5. Make your claims citable    → EvidencePlayPanel (the Pivota lever)
 *   6. The full plan               → StrategicBriefPanel
 *
 * Every panel no-ops when its slice of data is absent, so this degrades cleanly
 * on catalog audits that didn't probe discovery.
 */

import type { AgentCenterPerSkuReport } from '@/lib/types/ai-readiness';
import { ProductCompetitivenessPanel } from './ProductCompetitivenessPanel';
import { EnginePlaybookPanel } from './EnginePlaybookPanel';
import { CompetitorIntelPanel } from './CompetitorIntelPanel';
import { PromptEvidencePanel } from './PromptEvidencePanel';
import { ChannelAppearancePanel } from './ChannelAppearancePanel';
import { EvidencePlayPanel } from './EvidencePlayPanel';
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
      <details className="rounded border border-amber-200 p-3"><summary className="cursor-pointer font-medium">Historical product diagnostics — identity and recommendation unverified</summary><p className="text-sm">Saved flags and excerpts are diagnostic leads. They do not establish complete answer mentions or endorsements, and may refer to similarly named products.</p><ProductCompetitivenessPanel report={report} /></details>
      <div className="space-y-2"><p className="text-xs text-amber-800">Historical engine playbook: suggested actions, not verified ranking factors or recommendation outcomes. Verify the named sources and product match before acting.</p><EnginePlaybookPanel report={report} /></div>
      <CompetitorIntelPanel report={report} />
      <PromptEvidencePanel report={report} />
      <ChannelAppearancePanel report={report} />
      <EvidencePlayPanel report={report} />
      <StrategicBriefPanel report={report} />
      <AskAboutThis report={report} runId={runId} />
    </>
  );
}
