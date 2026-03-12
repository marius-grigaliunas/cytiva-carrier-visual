import { useState, useMemo, useEffect } from 'react';
import type { CarrierStats, PaceStatus } from '../types/schedule';
import {
  trucksToDepartures,
  getDefaultCutoffsByCarrier,
  getCutoffsByCarrierFromTrucks,
  type TruckDeparture,
  type TruckScheduleItemInput,
} from '../utils/truckSchedule';
import type { TruckScheduleItem } from '../types/schedule';

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

interface CarrierGanttProps {
  stats: CarrierStats[];
  /** Editable truck schedule - drives markers and default cutoffs */
  trucks?: TruckScheduleItem[];
  /** Cutoff times per carrier (from sidebar settings). When provided, controlled mode. */
  cutoffsByCarrier?: Record<string, number>;
  className?: string;
}

const ROW_HEIGHT = 40;
const LABEL_W = 120;
const TIMELINE_HOURS_START = 6;
const TIMELINE_HOURS_END = 23;

export function CarrierGantt({
  stats,
  trucks: trucksProp = [],
  cutoffsByCarrier: cutoffsProp,
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

  const defaultCutoffsFromSchedule = useMemo(getDefaultCutoffsByCarrier, []);
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

                    {/* Truck markers (milestones): Carrier Truck N HH:mm */}
                    {carrierTrucks.map((t) => {
                      const x = xFromMs(t.departureMs);
                      if (x < -2 || x > 102) return null;
                      const isPast = t.departureMs < now;
                      return (
                        <div
                          key={`${t.carrier}-${t.time}-${t.name}`}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5"
                          style={{ left: `${x}%` }}
                          title={`${t.carrierDisplay} ${t.name} @ ${t.time}${isPast ? ' (departed)' : ''}`}
                        >
                          <div
                            className={`
                              flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border shadow-sm
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
        <span>Labels = carrier + truck + time (greyed after departure)</span>
      </div>
    </div>
  );
}
