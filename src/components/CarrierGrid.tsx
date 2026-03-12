import type { CarrierStats, PaceStatus } from '../types/schedule';

const PACE_CLASSES: Record<PaceStatus, string> = {
  on_track: 'bg-emerald-500 dark:bg-emerald-500',
  at_risk: 'bg-amber-500 dark:bg-amber-500',
  behind: 'bg-red-500 dark:bg-red-500',
};

const PACE_LABELS: Record<PaceStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
};

interface CarrierGridProps {
  stats: CarrierStats[];
  className?: string;
}

export function CarrierGrid({ stats, className = '' }: CarrierGridProps) {
  return (
    <div
      className={`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 ${className}`}
    >
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
        Carrier grid
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.carrier}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3 text-xs"
          >
            <div className="font-semibold text-slate-800 dark:text-slate-100 mb-2 truncate" title={s.carrier}>
              {s.carrier}
            </div>
            <div className="space-y-1 text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Confirmed pallets</span>
                <span className="tabular-nums font-medium">{s.confirmedPallets}</span>
              </div>
              <div className="flex justify-between">
                <span>Pack rate</span>
                <span className="tabular-nums font-medium">
                  {s.burnRatePalletsPerHour.toFixed(1)}/hr
                </span>
              </div>
              <div className="flex justify-between">
                <span>Projected by cutoff</span>
                <span className="tabular-nums font-medium">
                  {s.projectedPalletsByCutoff.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">Pace</span>
              <div
                className={`flex-1 h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-600`}
                title={PACE_LABELS[s.paceStatus]}
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${PACE_CLASSES[s.paceStatus]}`}
                  style={{
                    width:
                      s.paceStatus === 'on_track'
                        ? '100%'
                        : s.paceStatus === 'at_risk'
                          ? '70%'
                          : '40%',
                  }}
                />
              </div>
              <span
                className={`shrink-0 font-medium ${
                  s.paceStatus === 'on_track'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : s.paceStatus === 'at_risk'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }`}
              >
                {PACE_LABELS[s.paceStatus]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CarrierGrid;
