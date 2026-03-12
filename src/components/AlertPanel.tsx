import type { AlertItem, AlertKind } from '../types/schedule';

const KIND_LABELS: Record<AlertKind, string> = {
  burn_rate_drop: 'Burn rate drop',
  projection_weak: 'Weak projection',
  truck_departed_with_packing: 'Truck departed with packing',
};

const KIND_CLASSES: Record<AlertKind, string> = {
  burn_rate_drop: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
  projection_weak: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-200',
  truck_departed_with_packing: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
};

interface AlertPanelProps {
  alerts: AlertItem[];
  className?: string;
}

export function AlertPanel({ alerts, className = '' }: AlertPanelProps) {
  return (
    <div
      className={`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 flex flex-col min-h-0 ${className}`}
    >
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 shrink-0">
        Alerts
        {alerts.length > 0 && (
          <span className="ml-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            ({alerts.length})
          </span>
        )}
      </h3>
      <div className="flex-1 min-h-0 overflow-auto space-y-1">
        {alerts.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
            No alerts.
          </p>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className={`rounded border px-2 py-1.5 text-xs ${KIND_CLASSES[a.kind]}`}
            >
              <div className="font-medium">{KIND_LABELS[a.kind]}</div>
              <div className="mt-0.5 opacity-90">{a.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AlertPanel;
