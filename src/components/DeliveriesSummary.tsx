import { type RefObject } from 'react';
import { formatDurationMs } from '../utils/tableHeaderFormulas';

export type TableColumnKey = 'delivery' | 'parcels' | 'pallets' | 'dispatchToPicking' | 'pickingToPacking' | 'packingToFirmContents';

export interface TableRow {
  deliveryId: string;
  parcels: number;
  pallets: number;
  dispatchToPickingMs: number | null;
}

const TABLE_COLUMNS: { key: TableColumnKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'delivery', label: 'Delivery', align: 'left' },
  { key: 'parcels', label: 'Number of parcels', align: 'right' },
  { key: 'pallets', label: 'Number of pallets', align: 'right' },
  { key: 'dispatchToPicking', label: 'Dispatch to picking', align: 'right' },
  { key: 'pickingToPacking', label: 'Picking to packing', align: 'right' },
  { key: 'packingToFirmContents', label: 'Packing to firm contents', align: 'right' },
];

function getCellValue(
  row: TableRow,
  key: TableColumnKey,
  formatFn: (ms: number) => string
): string {
  switch (key) {
    case 'delivery':
      return row.deliveryId;
    case 'parcels':
      return String(row.parcels);
    case 'pallets':
      return String(row.pallets);
    case 'dispatchToPicking':
      return row.dispatchToPickingMs != null ? formatFn(row.dispatchToPickingMs) : '—';
    case 'pickingToPacking':
    case 'packingToFirmContents':
      return '—';
    default:
      return '';
  }
}

interface DeliveriesSummaryProps {
  rows: TableRow[];
  columnFilters: Partial<Record<TableColumnKey, Set<string>>>;
  onColumnFiltersChange: (updater: (prev: Partial<Record<TableColumnKey, Set<string>>>) => Partial<Record<TableColumnKey, Set<string>>>) => void;
  filterPopup: TableColumnKey | null;
  onFilterPopupChange: (key: TableColumnKey | null) => void;
  filterPopupRef: RefObject<HTMLDivElement | null>;
  sort: { key: TableColumnKey; dir: 'asc' | 'desc' } | null;
  onSort: (key: TableColumnKey) => void;
  filterByCarriers: string[];
  containerTypeKey: string;
  outermostLpnKey: string;
  dispatchedTimestampKey: string;
}

export function DeliveriesSummary({
  rows,
  columnFilters,
  onColumnFiltersChange,
  filterPopup,
  onFilterPopupChange,
  filterPopupRef,
  sort,
  onSort,
  filterByCarriers,
  containerTypeKey,
  outermostLpnKey,
  dispatchedTimestampKey,
}: DeliveriesSummaryProps) {
  const filtered = rows.filter((row) => {
    for (const { key } of TABLE_COLUMNS) {
      const allowed = columnFilters[key];
      if (allowed !== undefined) {
        if (allowed.size === 0) return false;
        const v = getCellValue(row, key, formatDurationMs);
        if (!allowed.has(v)) return false;
      }
    }
    return true;
  });

  const sortKey = sort?.key ?? 'delivery';
  const dir = sort?.dir ?? 'asc';
  const mult = dir === 'asc' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'delivery':
        cmp = a.deliveryId.localeCompare(b.deliveryId, undefined, { numeric: true });
        break;
      case 'parcels':
        cmp = a.parcels - b.parcels;
        break;
      case 'pallets':
        cmp = a.pallets - b.pallets;
        break;
      case 'dispatchToPicking': {
        const va = a.dispatchToPickingMs ?? -1;
        const vb = b.dispatchToPickingMs ?? -1;
        cmp = va - vb;
        break;
      }
      case 'pickingToPacking':
      case 'packingToFirmContents':
        cmp = 0;
        break;
      default:
        cmp = a.deliveryId.localeCompare(b.deliveryId, undefined, { numeric: true });
    }
    return cmp * mult;
  });

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {(filterByCarriers.length > 0 || Object.keys(columnFilters).length > 0) && (
        <p className="text-xs text-slate-500 dark:text-slate-400 px-2 mb-1 shrink-0">
          {filterByCarriers.length > 0 && (
            <span className="text-blue-600 dark:text-blue-400">
              Carriers: {filterByCarriers.join(', ')}
            </span>
          )}
          {Object.keys(columnFilters).length > 0 && (
            <button
              type="button"
              onClick={() => onColumnFiltersChange(() => ({}))}
              className={`${filterByCarriers.length > 0 ? 'ml-1 ' : ''}text-slate-500 dark:text-slate-400 underline hover:text-slate-700 dark:hover:text-slate-200`}
            >
              Clear all table filters
            </button>
          )}
        </p>
      )}
      <div className="flex-1 min-h-0 overflow-auto border-t border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700/80 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
            <tr className="border-b border-slate-200 dark:border-slate-600">
              {TABLE_COLUMNS.map(({ key, label, align }) => (
                <th
                  key={key}
                  className={`font-semibold text-slate-700 dark:text-slate-200 px-2 py-1.5 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-slate-800 rounded ${align === 'right' ? 'justify-end w-full' : ''} ${sort?.key === key ? 'text-blue-600 dark:text-blue-400' : ''}`}
                  >
                    {label}
                    {sort?.key === key && (
                      <span className="text-blue-600 dark:text-blue-400" aria-hidden>
                        {sort?.dir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-200 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-700/50">
              {TABLE_COLUMNS.map(({ key, align }) => (
                <th key={key} className={`px-2 py-1 ${align === 'right' ? 'text-right' : 'text-left'}`}>
                  <div ref={filterPopup === key ? filterPopupRef : undefined} className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => onFilterPopupChange(filterPopup === key ? null : key)}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs border rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${filterPopup === key ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-slate-300 dark:border-slate-600'}`}
                      aria-label={`Filter by ${TABLE_COLUMNS.find((c) => c.key === key)?.label ?? key}`}
                      aria-expanded={filterPopup === key}
                    >
                      Filter
                      {columnFilters[key] !== undefined && (
                        <span className="text-blue-600 dark:text-blue-400 font-medium" aria-hidden>
                          ({columnFilters[key]?.size ?? 0})
                        </span>
                      )}
                    </button>
                    {filterPopup === key &&
                      (() => {
                        const distinct = [
                          ...new Set(rows.map((r) => getCellValue(r, key, formatDurationMs))),
                        ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                        const allowed = columnFilters[key];
                        const toggleValue = (v: string) => {
                          onColumnFiltersChange((prev) => {
                            const next = { ...prev };
                            const current = next[key] ?? new Set(distinct);
                            const nextSet = new Set(current);
                            if (nextSet.has(v)) nextSet.delete(v);
                            else nextSet.add(v);
                            if (nextSet.size === 0) next[key] = new Set();
                            else if (nextSet.size === distinct.length) {
                              delete next[key];
                            } else {
                              next[key] = nextSet;
                            }
                            return next;
                          });
                        };
                        const selectAll = () => {
                          onColumnFiltersChange((prev) => {
                            const next = { ...prev };
                            delete next[key];
                            return next;
                          });
                        };
                        const clearAll = () => {
                          onColumnFiltersChange((prev) => ({ ...prev, [key]: new Set() }));
                        };
                        return (
                          <div
                            className="absolute left-0 top-full mt-0.5 z-20 min-w-[180px] max-h-[240px] overflow-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded shadow-lg py-1 text-xs"
                            role="dialog"
                            aria-label={`Filter values for ${TABLE_COLUMNS.find((c) => c.key === key)?.label}`}
                          >
                            <div className="flex gap-0.5 px-1.5 pb-1 border-b border-slate-100 dark:border-slate-700">
                              <button
                                type="button"
                                onClick={selectAll}
                                className="flex-1 px-1.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded"
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                onClick={clearAll}
                                className="flex-1 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                              >
                                Clear all
                              </button>
                            </div>
                            <div className="py-0.5 max-h-[180px] overflow-auto">
                              {distinct.map((value) => (
                                <label
                                  key={value}
                                  className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"
                                >
                                  <input
                                    type="checkbox"
                                    checked={allowed === undefined ? true : allowed.has(value)}
                                    onChange={() => toggleValue(value)}
                                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="truncate" title={value}>
                                    {value || '(blank)'}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.deliveryId}
                className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50"
              >
                <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-slate-200">
                  {row.deliveryId}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                  {containerTypeKey && outermostLpnKey ? row.parcels.toLocaleString() : '—'}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                  {containerTypeKey && outermostLpnKey ? row.pallets.toLocaleString() : '—'}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                  {dispatchedTimestampKey
                    ? row.dispatchToPickingMs != null
                      ? formatDurationMs(row.dispatchToPickingMs)
                      : '—'
                    : '—'}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300 tabular-nums">—</td>
                <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300 tabular-nums">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
