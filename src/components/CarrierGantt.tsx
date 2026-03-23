import { useState, useMemo, useEffect, useRef } from 'react';
import type { CarrierKpiThresholds, CarrierStats } from '../types/schedule';
import {
  trucksToDepartures,
  getDefaultCutoffsByCarrier,
  getCutoffsByCarrierFromTrucks,
  type TruckDeparture,
  type TruckScheduleItemInput,
} from '../utils/truckSchedule';
import type { TruckScheduleItem } from '../types/schedule';

function normalizeCarrierKey(s: string): string {
  // Make colors stable across small naming differences ("KNAIR" vs "KN Air").
  return s.trim().replace(/\s+/g, '').toUpperCase();
}

// Fixed colors requested for the 5 main carriers.
// NOTE: Keys are normalized with `normalizeCarrierKey`.
const FIXED_CARRIER_COLORS: Record<string, string> = {
  GEODIS: '#008000', // green
  KNAIR: '#0000FF', // blue
  DHL: '#FFA500', // orange
  EXPEDITORS: '#000000', 
  DHLFREIGHT: '#808080', // light gray
};

// Used only for non-fixed carriers (if any appear in stats/trucks besides the 5 main ones).
const FALLBACK_CARRIER_COLORS = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#f97316', // orange
  '#eab308', // yellow/gold
  '#a855f7', // purple
  '#22c55e', // green
  '#06b6d4', // cyan
  '#ef4444', // red
  '#f43f5e', // rose
  '#3b82f6', // blue
  '#84cc16', // lime
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#14b8a6', // teal
];

interface CarrierGanttProps {
  stats: CarrierStats[];
  /** Editable truck schedule - drives markers and default cutoffs */
  trucks?: TruckScheduleItem[];
  /** Cutoff times per carrier (from sidebar settings). When provided, controlled mode. */
  cutoffsByCarrier?: Record<string, number>;
  /** KPI thresholds per carrier for row KPI coloring. */
  kpiThresholdsByCarrier?: Record<string, CarrierKpiThresholds>;
  className?: string;
}

const ROW_HEIGHT = 72;
const LABEL_W = 150;
const TIMELINE_HOURS_START = 0;
const TIMELINE_HOURS_END = 24;
const HOUR_WIDTH_PX = 100;
const FOCUS_BEFORE_HOURS = 3;
const FOCUS_AFTER_HOURS = 10;
const FOCUS_SNAP_INTERVAL_MS = 5 * 60 * 1000;

function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 10) / 10;
  const asInt = Math.round(rounded);
  return Math.abs(rounded - asInt) < 1e-9 ? asInt.toLocaleString() : rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function CarrierGantt({
  stats,
  trucks: trucksProp = [],
  cutoffsByCarrier: cutoffsProp,
  kpiThresholdsByCarrier = {},
  className = '',
}: CarrierGanttProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const defaultCutoffsFromSchedule = useMemo(() => getDefaultCutoffsByCarrier(), []);
  const defaultCutoffs = useMemo(() => {
    if (trucksProp.length > 0) {
      const isCancelled = (t: TruckScheduleItemInput): boolean => {
        const c = (t as TruckScheduleItem).cancelled;
        return c === true;
      };
      const fromTrucks = getCutoffsByCarrierFromTrucks(trucksProp, isCancelled);
      return Object.keys(fromTrucks).length > 0 ? fromTrucks : defaultCutoffsFromSchedule;
    }
    return defaultCutoffsFromSchedule;
  }, [trucksProp, defaultCutoffsFromSchedule]);
  const [localCutoffs, setLocalCutoffs] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const s of stats) {
      init[s.carrier] = s.cutoffMs ?? defaultCutoffs[s.carrier] ?? today.getTime() + 12 * 60 * 60 * 1000;
    }
    for (const [k, v] of Object.entries(defaultCutoffs)) {
      if (init[k] == null) init[k] = v;
    }
    return init;
  });

  const cutoffsByCarrier = cutoffsProp ?? localCutoffs;
  const isControlled = cutoffsProp != null;

  // Sync local cutoffs when stats or trucks change (uncontrolled only)
  useEffect(() => {
    if (isControlled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalCutoffs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of stats) {
        if (next[s.carrier] == null) {
          next[s.carrier] = s.cutoffMs ?? defaultCutoffs[s.carrier] ?? today.getTime() + 12 * 60 * 60 * 1000;
          changed = true;
        }
      }
      for (const [k, v] of Object.entries(defaultCutoffs)) {
        if (next[k] == null) {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stats, defaultCutoffs, today, isControlled]);

  const trucks = useMemo(() => {
    if (trucksProp.length > 0) {
      return trucksToDepartures(trucksProp, (t) => (t as TruckScheduleItem).cancelled === true);
    }
    return trucksToDepartures([]);
  }, [trucksProp]);
  const carriers = useMemo(() => {
    const order = new Map<string, number>();
    stats.forEach((s, i) => order.set(s.carrier, i));
    const all = new Set(
      [...stats.map((s) => s.carrier), ...trucks.map((t) => t.carrierDisplay)]
    );
    // Show "Other" only when at least one truck actually uses it.
    const trucksHaveOther = trucks.some((t) => t.carrierDisplay === 'Other');
    if (!trucksHaveOther) all.delete('Other');
    return [...all].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }, [stats, trucks]);

  const statsByCarrier = useMemo(() => {
    const map: Record<string, CarrierStats> = {};
    for (const s of stats) map[s.carrier] = s;
    return map;
  }, [stats]);

  const carrierColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const used = new Set<string>();

    // 1) Apply fixed colors first (so they win over fallback).
    for (const carrier of carriers) {
      const fixed = FIXED_CARRIER_COLORS[normalizeCarrierKey(carrier)];
      if (fixed) {
        map[carrier] = fixed;
        used.add(fixed);
      }
    }

    // 2) Assign unique fallback colors for any remaining carriers.
    const remaining = carriers.filter((c) => map[c] == null);
    remaining.forEach((carrier, i) => {
      // If we run out of predefined colors, generate a deterministic hue.
      const fallback = FALLBACK_CARRIER_COLORS[i % FALLBACK_CARRIER_COLORS.length];
      if (used.has(fallback)) {
        const hue = (i * (360 / Math.max(1, remaining.length)) + 20) % 360;
        const generated = `hsl(${hue.toFixed(0)}, 85%, 45%)`;
        map[carrier] = generated;
        used.add(generated);
        return;
      }

      map[carrier] = fallback;
      used.add(fallback);
    });

    return map;
  }, [carriers]);

  const rangeStartMs = today.getTime() + TIMELINE_HOURS_START * 60 * 60 * 1000;
  const rangeEndMs = today.getTime() + TIMELINE_HOURS_END * 60 * 60 * 1000;
  const rangeMs = rangeEndMs - rangeStartMs;
  const timelineWidthPx = (TIMELINE_HOURS_END - TIMELINE_HOURS_START) * HOUR_WIDTH_PX;
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  function xFromMs(ms: number): number {
    const clamped = Math.max(rangeStartMs, Math.min(rangeEndMs, ms));
    return ((clamped - rangeStartMs) / rangeMs) * 100;
  }

  const trucksByCarrier = useMemo(() => {
    const map = new Map<string, TruckDeparture[]>();
    for (const t of trucks) {
      const list = map.get(t.carrierDisplay) ?? [];
      list.push(t);
      map.set(t.carrierDisplay, list);
    }
    for (const [, list] of map) list.sort((a, b) => a.departureMs - b.departureMs);
    return map;
  }, [trucks]);

  const tickHours = useMemo(() => {
    const arr: number[] = [];
    for (let h = TIMELINE_HOURS_START; h <= TIMELINE_HOURS_END; h++) arr.push(h);
    return arr;
  }, []);

  const nowX = xFromMs(now);
  const nowInRange = now >= rangeStartMs && now <= rangeEndMs;

  // Keep timeline focused on [now - 3h, min(now + 10h, 00:00)] while still rendering the full day.
  // Snap only every 5 minutes so users can inspect future timeline without constant recentering.
  useEffect(() => {
    const scroller = timelineScrollRef.current;
    if (!scroller) return;

    const focusStartMs = Math.max(
      rangeStartMs,
      now - FOCUS_BEFORE_HOURS * 60 * 60 * 1000
    );
    const focusEndMs = Math.min(
      rangeEndMs,
      now + FOCUS_AFTER_HOURS * 60 * 60 * 1000
    );

    const focusStartX = xFromMs(focusStartMs);
    const focusEndX = xFromMs(focusEndMs);
    const startPx = (focusStartX / 100) * timelineWidthPx;
    const endPx = (focusEndX / 100) * timelineWidthPx;
    const desiredLeft = Math.max(0, startPx - 16);
    const desiredRight = Math.min(timelineWidthPx, endPx + 16);
    const desiredWidth = Math.max(0, desiredRight - desiredLeft);
    const viewportWidth = scroller.clientWidth;

    let nextScrollLeft = desiredLeft;
    if (desiredWidth < viewportWidth) {
      nextScrollLeft = Math.max(
        0,
        Math.min(
          timelineWidthPx - viewportWidth,
          desiredLeft - (viewportWidth - desiredWidth) / 2
        )
      );
    }

    scroller.scrollTo({ left: nextScrollLeft, behavior: 'auto' });
  }, [
    Math.floor(now / FOCUS_SNAP_INTERVAL_MS),
    rangeStartMs,
    rangeEndMs,
    timelineWidthPx,
  ]);

  return (
    <div
      className={`flex flex-col rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden ${className}`}
    > {/* Gantt chart */}
      <div className="flex-1 min-h-0 overflow-auto p-2">
        <div className="min-w-[400px] flex gap-0">
          {/* Carrier labels column */}
          <div
            className="shrink-0 flex flex-col"
            style={{ width: LABEL_W }}
          >
            <div className="h-6 shrink-0" />
            {carriers.map((carrier) => (
              <div
                key={carrier}
                className="px-2 border-b border-slate-100 dark:border-slate-700/80"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="h-full flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: carrierColorMap[carrier] ?? '#94a3b8' }}
                  />
                  <span
                    className="truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100"
                    title={carrier}
                  >
                    {carrier}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline column */}
          <div ref={timelineScrollRef} className="flex-1 relative min-w-[280px] overflow-x-auto">
            <div className="relative" style={{ width: timelineWidthPx }}>
              {/* Time axis */}
              <div className="flex h-6 mb-1">
                {tickHours.map((h) => (
                  <div
                    key={h}
                    className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-600 pl-0.5"
                    style={{ width: HOUR_WIDTH_PX }}
                  >
                    {h === 24 ? '00:00' : `${String(h).padStart(2, '0')}:00`}
                  </div>
                ))}
              </div>

              {/* Rows + now line */}
              <div className="relative">
                {nowInRange && (
                  <>
                    <div
                      className="absolute -top-5 left-0 -translate-x-1/2 z-20 pointer-events-none text-[10px] font-semibold tabular-nums text-red-600 dark:text-red-400 whitespace-nowrap"
                      style={{ left: `${nowX}%` }}
                    >
                      {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 dark:bg-red-400 z-20 pointer-events-none"
                      style={{ left: `${nowX}%` }}
                    />
                  </>
                )}
                {carriers.map((carrier) => {
                  const cutoffMs = cutoffsByCarrier[carrier] ?? defaultCutoffs[carrier];
                  const color = carrierColorMap[carrier] ?? '#64748b';
                  const barEndX = cutoffMs != null ? xFromMs(cutoffMs) : 100;
                  const carrierTrucks = trucksByCarrier.get(carrier) ?? [];

                  return (
                    <div
                      key={carrier}
                      className="relative border-b border-slate-100 dark:border-slate-700/80"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {(() => {
                        const s = statsByCarrier[carrier];
                        const palletsNotShipped = s?.confirmedPallets ?? 0;
                        const packedLastHour = s?.burnRatePalletsPerHour ?? 0;
                        const thresholds = kpiThresholdsByCarrier[carrier] ?? {
                          notShippedYellow: 20,
                          notShippedRed: 10,
                          packedLastHourYellow: 2,
                          packedLastHourRed: 1,
                        };

                        const severityFromThreshold = (
                          value: number,
                          yellow: number,
                          red: number
                        ): 0 | 1 | 2 => {
                          const low = Math.min(yellow, red);
                          const high = Math.max(yellow, red);
                          if (value < low) return 2;
                          if (value < high) return 1;
                          return 0;
                        };

                        const severity = Math.max(
                          severityFromThreshold(
                            palletsNotShipped,
                            thresholds.notShippedYellow,
                            thresholds.notShippedRed
                          ),
                          severityFromThreshold(
                            packedLastHour,
                            thresholds.packedLastHourYellow,
                            thresholds.packedLastHourRed
                          )
                        );

                        const kpiBoxClass =
                          severity === 2
                            ? 'border-red-200 bg-red-50/90 text-red-900 dark:border-red-900/50 dark:bg-red-900/35 dark:text-red-100'
                            : severity === 1
                              ? 'border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/35 dark:text-amber-100'
                              : 'border-emerald-200 bg-emerald-50/90 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-900/35 dark:text-emerald-100';

                        // Position this block left of the vertical "Now" line.
                        const rowBoxesStyle = nowInRange
                          ? { right: `calc(${(100 - nowX).toFixed(4)}% + 8px)` }
                          : { right: 8 };
                        const compact = nowX < 34;

                        return (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 z-30 flex pointer-events-none ${
                              compact ? 'flex-col gap-1' : 'items-center gap-1.5'
                            }`}
                            style={rowBoxesStyle}
                          >
                            <div className="flex items-baseline justify-between gap-2 min-w-0">
                              <div
                                className={`rounded border shadow-sm px-2 py-1 text-[11px] leading-tight tabular-nums whitespace-nowrap ${kpiBoxClass}`}
                              >
                                Pallets not shipped = {formatCompactNumber(palletsNotShipped)}
                              </div>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 min-w-0">
                              <div
                                className={`rounded border shadow-sm px-2 py-1 text-[11px] leading-tight tabular-nums whitespace-nowrap ${kpiBoxClass}`}
                              >
                                Packed last hour = {formatCompactNumber(packedLastHour)}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Colored bar from start to cutoff */}
                      <div
                        className="absolute inset-y-2 left-0 right-0 rounded overflow-hidden"
                      >
                        <div
                        className="h-full rounded"
                          style={{
                            width: `${Math.min(100, Math.max(0, barEndX))}%`,
                            backgroundColor: color,
                          opacity: 0.7,
                          filter: 'saturate(1.25)',
                          }}
                        />
                      </div>

                      {/* Truck departure markers: exact vertical line + right-side truck label */}
                      {carrierTrucks.map((t) => {
                        const x = xFromMs(t.departureMs);
                        if (x < -2 || x > 102) return null;
                        const isPast = t.departureMs < now;
                        return (
                          <div
                            key={`${t.carrier}-${t.time}-${t.name}`}
                            className="absolute inset-y-2 z-10 pointer-events-none"
                            style={{ left: `${x}%` }}
                            title={`${t.carrierDisplay} ${t.name} @ ${t.time}${isPast ? ' (departed)' : ''}`}
                          >
                            <div
                              className={`absolute inset-y-0 w-0.5 -translate-x-1/2 ${isPast ? 'bg-slate-500 dark:bg-slate-500' : 'bg-black dark:bg-black'}`}
                            >
                            </div>
                            <div
                              className={`
                                absolute top-1/2 ml-1.5 -translate-y-1/2 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border shadow-sm whitespace-nowrap
                                ${isPast
                                  ? 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                }
                              `}
                              style={!isPast ? { borderColor: color } : undefined}
                            >
                              <span
                                className={isPast ? 'text-slate-400 dark:text-slate-500' : 'font-semibold'}
                                style={!isPast ? { color } : undefined}
                              >
                                {t.carrierDisplay}
                              </span>
                              <span className={isPast ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}>
                                {t.name} {t.time}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="text-slate-500 dark:text-slate-400">Carriers</span>
        {carriers.map((carrier) => (
          <span key={carrier} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: carrierColorMap[carrier] }} />
            {carrier}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-red-500" />
          Now
        </span>
        <span>Truck departure = black vertical line; labels = carrier + truck + time</span>
      </div>
    </div>
  );
}
