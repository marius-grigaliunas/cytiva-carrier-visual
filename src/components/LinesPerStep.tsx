interface LinesPerStepProps {
  bars: { step: string; count: number }[];
  maxCount: number;
  pendingSteps: Set<string>;
  inSelectionMode: boolean;
  filterByCarriers: string[];
  stepKey: string;
  onToggleStep: (step: string) => void;
  onConfirmSelection: () => void;
  onCancelSelection: () => void;
}

export function LinesPerStep({
  bars,
  maxCount,
  pendingSteps,
  inSelectionMode,
  filterByCarriers,
  stepKey,
  onToggleStep,
  onConfirmSelection,
  onCancelSelection,
}: LinesPerStepProps) {
  return (
    <div
      className="h-full flex flex-col min-h-0 overflow-hidden"
      onClick={inSelectionMode ? onConfirmSelection : undefined}
    >
      {inSelectionMode && (
        <div className="absolute top-2 right-2 flex items-center gap-1 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 shadow-sm">
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
            disabled={pendingSteps.size === 0}
            className="rounded p-1.5 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 disabled:pointer-events-none"
            title="Confirm selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      )}
      {(filterByCarriers.length > 0 || inSelectionMode) && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 shrink-0">
          {filterByCarriers.length > 0 && (
            <span className="text-blue-600 dark:text-blue-400">
              Carriers: {filterByCarriers.join(', ')}
            </span>
          )}
          {inSelectionMode && (
            <span className={filterByCarriers.length > 0 ? ' ml-2' : ''}>
              {pendingSteps.size > 0
                ? `Selected: ${Array.from(pendingSteps).join(', ')} — ✓ confirm, X cancel`
                : 'Click steps, then ✓ to filter'}
            </span>
          )}
        </p>
      )}
      {stepKey ? (
        <div
          className="flex-1 min-h-0 overflow-auto space-y-1"
          style={{ minHeight: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {bars.map(({ step, count }) => (
            <button
              type="button"
              key={step}
              onClick={() => onToggleStep(step)}
              className={`w-full flex items-center gap-1 text-left rounded p-0.5 -m-0.5 transition-colors ${
                pendingSteps.has(step)
                  ? 'ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-slate-800 bg-emerald-50 dark:bg-emerald-900/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="w-28 shrink-0 text-xs font-medium text-slate-700 dark:text-slate-300 truncate" title={step}>
                {step}
              </div>
              <div className="flex-1 flex items-center gap-1 min-w-0">
                <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-sm overflow-hidden min-w-0">
                  <div
                    className="h-full bg-emerald-500 rounded-sm min-w-[2px] transition-all duration-300"
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
      ) : (
        <p className="text-slate-500 dark:text-slate-400 text-xs">
          No &quot;Next Outbound Step&quot; column found in this report.
        </p>
      )}
    </div>
  );
}
