export function MeasuredGenerationPrice({ deck = false }: { deck?: boolean }) {
  return (
    <p className="mt-1 text-[11px] text-[color:var(--merchant-muted)]">
      {deck ? 'AI summary: ' : ''}Actual model cost × 1.6, up to 1 credit.
      {' '}Fractional usage only; saved results are free to reopen.
    </p>
  );
}
