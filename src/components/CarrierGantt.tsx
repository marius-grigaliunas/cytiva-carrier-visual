import { useState, useMemo, useCallback, useEffect } from 'react';
import type { CarrierStats, PaceStatus } from '../types/schedule';
import {
  getTruckDepartures,
  getDefaultCutoffsByCarrier,
  type TruckDeparture,
} from '../utils/truckSchedule';

const PACE_COLORS: Record<PaceStatus, string> = {
  on_track: '#10b981',
  at_risk: '#f59e0b',
  behind: '#ef4444',
};

const CARRIER_COLORS: Record<string, string> = {
  'DHL Freight': '#ff6b35',
  DHL: '#ffcd00',
  EXPEDITORS: '#2563eb',
  'KN Air': '#7c3aed',
  GEODIS: '#059669',
  Other: '#64748b',
};

function msToTimeStr(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeStrToMs(timeStr: string, baseDate: Date): number {
  const [h, m] = timeStr.trim().split(':').map((s) => parseInt(s, 10) || 0);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

interface CarrierGanttProps {
  stats: CarrierStats[];
  className?: string;
  /** Called when cutoffs change (e.g. for parent to persist or recalc) */
  onCutoffChange?: (cutoffsByCarrier: Record<string, number>) => void;
}

const ROW_HEIGHT = 40;
const LABEL_W = 120;
const TIMELINE_HOURS_START = 6;
const TIMELINE_HOURS_END = 23;

export function CarrierGantt({
  stats,
  className = '',
  onCutoffChange,
}: CarrierGanttProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const defaultCutoffs = useMemo(getDefaultCutoffsByCarrier, []);
  const [cutoffsByCarrier, setCutoffsByCarrier] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const s of stats) {
      init[s.carrier] = s.cutoffMs ?? defaultCutoffs[s.carrier] ?? today.getTime() + 12 * 60 * 60 * 1000;
    }
    for (const [k, v] of Object.entries(defaultCutoffs)) {
      if (init[k] == null) init[k] = v;
    }
    return init;
  });

  // Sync cutoffs when stats carriers change
  useEffect(() => {
    setCutoffsByCarrier((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of stats) {
        if (next[s.carrier] == null) {
          next[s.carrier] = s.cutoffMs ?? defaultCutoffs[s.carrier] ?? today.getTime() + 12 * 60 * 60 * 1000;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stats, defaultCutoffs, today]);

  const handleCutoffChange = useCallback(
    (carrier: string, ms: number) => {
      setCutoffsByCarrier((prev) => {
        const next = { ...prev, [carrier]: ms };
        onCutoffChange?.(next);
        return next;
      });
    },
    [onCutoffChange]
  );

  const trucks = useMemo(getTruckDepartures, []);
  const carriers = useMemo(() => {
    const order = new Map<string, number>();
    stats.forEach((s, i) => order.set(s.carrier, i));
    const all = new Set([...stats.map((s) => s.carrier), ...trucks.map((t) => t.carrierDisplay)]);
    return [...all].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }, [stats, trucks]);

  const rangeStartMs = today.getTime() + TIMELINE_HOURS_START * 60 * 60 * 1000;
  const rangeEndMs = today.getTime() + TIMELINE_HOURS_END * 60 * 60 * 1000;
  const rangeMs = rangeEndMs - rangeStartMs;

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

  return (
    <div
      className={`flex flex-col rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Carrier schedule (Gantt)
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          Now: {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Editable cutoff table */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
          Cutoff times (edit for extra trucks or cancellations)
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {carriers.map((carrier) => {
            const ms = cutoffsByCarrier[carrier] ?? defaultCutoffs[carrier];
            const timeStr = ms != null ? msToTimeStr(ms) : '--:--';
            return (
              <div key={carrier} className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 min-w-[90px]">
                  {carrier}
                </span>
                <input
                  type="time"
                  value={timeStr}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) {
                      const ms = timeStrToMs(v, today);
                      handleCutoffChange(carrier, ms);
                    }
                  }}
                  className="text-xs w-20 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Gantt chart */}
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
                className="flex items-center px-2 text-xs font-medium text-slate-700 dark:text-slate-300 truncate border-b border-slate-100 dark:border-slate-700/80"
                style={{ height: ROW_HEIGHT }}
              >
                {carrier}
              </div>
            ))}
          </div>

          {/* Timeline column */}
          <div className="flex-1 relative min-w-[280px]">
            {/* Time axis */}
            <div className="flex h-6 mb-1">
              {tickHours.map((h) => (
                <div
                  key={h}
                  className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-600 pl-0.5"
                  style={{ flex: 1 }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Rows + now line */}
            <div className="relative">
              {nowInRange && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 dark:bg-red-400 z-20 pointer-events-none"
                  style={{ left: `${nowX}%` }}
                />
              )}
              {carriers.map((carrier) => {
                const cutoffMs = cutoffsByCarrier[carrier] ?? defaultCutoffs[carrier];
                const stat = stats.find((s) => s.carrier === carrier);
                const color = stat
                  ? PACE_COLORS[stat.paceStatus]
                  : CARRIER_COLORS[carrier] ?? '#64748b';
                const barEndX = cutoffMs != null ? xFromMs(cutoffMs) : 100;
                const carrierTrucks = trucksByCarrier.get(carrier) ?? [];

                return (
                  <div
                    key={carrier}
                    className="relative border-b border-slate-100 dark:border-slate-700/80"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Colored bar from start to cutoff */}
                    <div
                      className="absolute inset-y-2 left-0 right-0 rounded overflow-hidden"
                    >
                      <div
                        className="h-full rounded opacity-30"
                        style={{
                          width: `${Math.min(100, Math.max(0, barEndX))}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>

                    {/* Truck markers (milestones) */}
                    {carrierTrucks.map((t) => {
                      const x = xFromMs(t.departureMs);
                      if (x < -2 || x > 102) return null;
                      const isPast = t.departureMs < now;
                      return (
                        <div
                          key={`${t.carrier}-${t.time}-${t.name}`}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                          style={{ left: `${x}%` }}
                          title={`${t.name} @ ${t.time}${isPast ? ' (departed)' : ''}`}
                        >
                          <div
                            className={`
                              w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                              border-2 shadow-sm
                              ${isPast
                                ? 'bg-slate-200 dark:bg-slate-600 border-slate-400 dark:border-slate-500 text-slate-600 dark:text-slate-300'
                                : 'bg-white dark:bg-slate-700 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100'
                              }
                            `}
                            style={{ borderColor: isPast ? undefined : color }}
                          >
                            {t.truckNumber}
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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: PACE_COLORS.on_track }}
          />
          On track
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: PACE_COLORS.at_risk }}
          />
          At risk
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: PACE_COLORS.behind }}
          />
          Behind
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-red-500" />
          Now
        </span>
        <span>Numbered circles = truck departure</span>
      </div>
    </div>
  );
}
