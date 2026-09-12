export function MeasuredGenerationPrice({ deck = false }: { deck?: boolean }) {
  return (
    <p
      className="mt-1 text-[11px] text-[color:var(--merchant-muted)]"
      title="Actual model cost × 1.6, with no minimum charge. Keep 1 credit available for the maximum cost. Reopening a saved result costs 0 credits."
    >
      {deck ? 'AI summary: ' : ''}Actual usage × 1.6 · max 1 credit
    </p>
  );
}
