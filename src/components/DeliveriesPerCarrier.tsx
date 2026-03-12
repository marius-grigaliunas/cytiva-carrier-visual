interface DeliveriesPerCarrierProps {
  bars: { carrier: string; count: number }[];
  maxCount: number;
  pendingCarriers: Set<string>;
  inSelectionMode: boolean;
  filterBySteps: string[];
  onToggleCarrier: (carrier: string) => void;
  onConfirmSelection: () => void;
  onCancelSelection: () => void;
}

export function DeliveriesPerCarrier({
  bars,
  maxCount,
  pendingCarriers,
  inSelectionMode,
  filterBySteps,
  onToggleCarrier,
  onConfirmSelection,
  onCancelSelection,
}: DeliveriesPerCarrierProps) {
  return (
    <div
      className="h-full flex flex-col min-h-0 overflow-hidden"
      onClick={inSelectionMode ? onConfirmSelection : undefined}
    >
      {inSelectionMode && (
        <div className="flex items-center gap-1 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 shadow-sm mb-1 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Confirm or cancel:</span>
          <button
            type="button"
            aria-label="Cancel selection"
            onClick={(e) => {
              e.stopPropagation();
              onCancelSelection();
            }}
            className="rounded p-1.5 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300"
            title="Cancel selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Confirm selection"
            onClick={(e) => {
              e.stopPropagation();
              onConfirmSelection();
            }}
            disabled={pendingCarriers.size === 0}
            className="rounded p-1.5 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 disabled:pointer-events-none"
            title="Confirm selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      )}
      {(filterBySteps.length > 0 || inSelectionMode) && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 shrink-0">
          {filterBySteps.length > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">
              Steps: {filterBySteps.join(', ')}
            </span>
          )}
          {inSelectionMode && (
            <span className={filterBySteps.length > 0 ? ' ml-2' : ''}>
              {pendingCarriers.size > 0
                ? `Selected: ${Array.from(pendingCarriers).join(', ')} — ✓ confirm, X cancel`
                : 'Click carriers, then ✓ to filter'}
            </span>
          )}
        </p>
      )}
      <div
        className="flex-1 min-h-0 overflow-auto space-y-1"
        style={{ minHeight: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {bars.map(({ carrier, count }) => (
          <button
            type="button"
            key={carrier}
            onClick={() => onToggleCarrier(carrier)}
            className={`w-full flex items-center gap-1 text-left rounded p-0.5 -m-0.5 transition-colors ${
              pendingCarriers.has(carrier)
                ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-800 bg-blue-50 dark:bg-blue-900/30'
                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
          >
            <div className="w-24 shrink-0 text-xs font-medium text-slate-700 dark:text-slate-300 truncate" title={carrier}>
              {carrier}
            </div>
            <div className="flex-1 flex items-center gap-1 min-w-0">
              <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-sm overflow-hidden min-w-0">
                <div
                  className="h-full bg-blue-500 rounded-sm min-w-[2px] transition-all duration-300"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300 font-medium">
                {count.toLocaleString()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
