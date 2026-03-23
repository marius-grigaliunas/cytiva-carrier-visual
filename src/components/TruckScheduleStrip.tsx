import { useState, useEffect, useCallback } from 'react';
import type { TruckScheduleItem } from '../types/schedule';
import { TRUCK_CARRIER_TO_DISPLAY, formatTruckDisplayLabel } from '../utils/truckSchedule';
import { useTruckDepartureStore } from '../stores/truckDepartureStore';

const COUNTDOWN_UPDATE_MS = 1000;

function formatCountdown(msUntil: number): string {
  if (msUntil <= 0) return 'Departed';
  const sec = Math.floor(msUntil / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const parts: string[] = [];
  if (hr > 0) parts.push(`${hr}h`);
  parts.push(`${min % 60}m`);
  parts.push(`${sec % 60}s`);
  return parts.join(' ');
}

function msToDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function datetimeLocalToMs(s: string): number {
  const n = Date.parse(s);
  return Number.isNaN(n) ? Date.now() : n;
}

/** Urgency: more urgent as departure approaches. */
function urgencyLevel(msUntil: number): 'far' | 'soon' | 'urgent' | 'imminent' | 'departed' {
  if (msUntil <= 0) return 'departed';
  const min = msUntil / (60 * 1000);
  if (min <= 5) return 'imminent';
  if (min <= 15) return 'urgent';
  if (min <= 60) return 'soon';
  return 'far';
}

const URGENCY_CLASSES: Record<ReturnType<typeof urgencyLevel>, string> = {
  far: 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600',
  soon: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  urgent: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700',
  imminent: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700',
  departed: 'bg-slate-200 dark:bg-slate-600 border-slate-300 dark:border-slate-500 opacity-75',
};

const CARRIER_KEYS = Object.keys(TRUCK_CARRIER_TO_DISPLAY);
const OTHER_OPTION_VALUE = '__OTHER__';

export interface AddTruckData {
  name: string;
  time: string;
  carrier: string;
}

interface TruckScheduleStripProps {
  trucks: TruckScheduleItem[];
  onTrucksChange: (trucks: TruckScheduleItem[]) => void;
  onCancelTruck?: (id: string) => void;
  onRestoreTruck?: (id: string) => void;
  /** Called when user submits add-truck form with name, time, carrier */
  onAddTruck?: (truck: AddTruckData) => void;
  className?: string;
}

export function TruckScheduleStrip({
  trucks,
  onTrucksChange,
  onCancelTruck,
  onRestoreTruck,
  onAddTruck,
  className = '',
}: TruckScheduleStripProps) {
  const statusById = useTruckDepartureStore((s) => s.statusById);
  const markDeparted = useTruckDepartureStore((s) => s.markDeparted);
  const markPresent = useTruckDepartureStore((s) => s.markPresent);

  const [now, setNow] = useState(() => Date.now());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [carrierOption, setCarrierOption] = useState<string>(() => CARRIER_KEYS[0] ?? 'GEODIS');
  const [otherCarrierInput, setOtherCarrierInput] = useState<string>('');
  const [addForm, setAddForm] = useState<AddTruckData>(() => {
    const maxNum = trucks.reduce((acc, t) => {
      const m = t.label.match(/Truck\s*(\d+)/i);
      return Math.max(acc, m ? parseInt(m[1], 10) : 0);
    }, 0);
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    return {
      name: `Truck ${maxNum + 1}`,
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      carrier: CARRIER_KEYS[0] ?? 'GEODIS',
    };
  });

  useEffect(() => {
    if (showAddForm) {
      const maxNum = trucks.reduce((acc, t) => {
        const m = t.label.match(/Truck\s*(\d+)/i);
        return Math.max(acc, m ? parseInt(m[1], 10) : 0);
      }, 0);
      const d = new Date();
      d.setMinutes(d.getMinutes() + 60);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddForm((prev) => ({
        ...prev,
        name: `Truck ${maxNum + 1}`,
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      }));
    }
  }, [showAddForm, trucks.length]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), COUNTDOWN_UPDATE_MS);
    return () => clearInterval(t);
  }, []);

  const handleCancel = useCallback(
    (id: string) => {
      if (onCancelTruck) {
        onCancelTruck(id);
      } else {
        onTrucksChange(
          trucks.map((t) => (t.id === id ? { ...t, cancelled: true } : t))
        );
      }
    },
    [trucks, onTrucksChange, onCancelTruck]
  );

  const handleRestore = useCallback(
    (id: string) => {
      if (onRestoreTruck) {
        onRestoreTruck(id);
      } else {
        onTrucksChange(
          trucks.map((t) => (t.id === id ? { ...t, cancelled: false } : t))
        );
      }
    },
    [trucks, onTrucksChange, onRestoreTruck]
  );

  const handleDepartureChange = useCallback(
    (id: string, value: string) => {
      const ms = datetimeLocalToMs(value);
      onTrucksChange(
        trucks.map((t) => (t.id === id ? { ...t, departureMs: ms } : t))
      );
    },
    [trucks, onTrucksChange]
  );

  const handleSubmitAdd = useCallback(() => {
    if (!onAddTruck) return;
    const carrier =
      carrierOption === OTHER_OPTION_VALUE ? (otherCarrierInput.trim() || 'Other') : carrierOption;
    onAddTruck({ ...addForm, carrier });
    setShowAddForm(false);
  }, [onAddTruck, addForm, carrierOption, otherCarrierInput]);

  const visibleTrucks = trucks.filter((t) => !t.cancelled && (statusById[t.id] ?? 'present') !== 'departed');
  const cancelledTrucks = trucks.filter((t) => t.cancelled);
  const departedTrucks = trucks.filter((t) => !t.cancelled && (statusById[t.id] ?? 'present') === 'departed');

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Truck schedule
        </h3>
        {onAddTruck && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="text-xs font-medium px-2 py-1 rounded bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            {showAddForm ? 'Cancel' : '+ Add truck'}
          </button>
        )}
      </div>
      {showAddForm && onAddTruck && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 p-2">
          <input
            type="text"
            placeholder="Name"
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            className="text-xs w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          />
          <input
            type="time"
            value={addForm.time}
            onChange={(e) => setAddForm((f) => ({ ...f, time: e.target.value }))}
            className="text-xs w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          />
          <select
            value={carrierOption}
            onChange={(e) => {
              const v = e.target.value;
              setCarrierOption(v);
              if (v === OTHER_OPTION_VALUE) {
                setAddForm((f) => ({ ...f, carrier: otherCarrierInput.trim() || 'Other' }));
                return;
              }
              setOtherCarrierInput('');
              setAddForm((f) => ({ ...f, carrier: v }));
            }}
            className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          >
            {CARRIER_KEYS.map((key) => (
              <option key={key} value={key}>
                {TRUCK_CARRIER_TO_DISPLAY[key]}
              </option>
            ))}
            <option value={OTHER_OPTION_VALUE}>Other...</option>
          </select>
          {carrierOption === OTHER_OPTION_VALUE && (
            <input
              type="text"
              placeholder="Carrier name (e.g. Logistics Co)"
              value={otherCarrierInput}
              onChange={(e) => {
                const v = e.target.value;
                setOtherCarrierInput(v);
                setAddForm((f) => ({ ...f, carrier: v.trim() || 'Other' }));
              }}
              className="text-xs w-40 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            />
          )}
          <button
            type="button"
            onClick={handleSubmitAdd}
            className="text-xs font-medium px-2 py-1 rounded bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            Add
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {visibleTrucks.map((truck) => {
          const msUntil = truck.departureMs - now;
          const urgency = urgencyLevel(msUntil);
          const isEditing = editingId === truck.id;
          const isDeparted = (statusById[truck.id] ?? 'present') === 'departed';
          return (
            <div
              key={truck.id}
              className={`inline-flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${URGENCY_CLASSES[urgency]}`}
            >
              <span
                className="font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                onClick={() => {
                  if (!isEditing) setEditingId(truck.id);
                }}
                role="button"
                aria-label="Edit truck"
              >
                {!isEditing ? (
                  formatTruckDisplayLabel(
                    TRUCK_CARRIER_TO_DISPLAY[truck.carrier] ?? truck.carrier,
                    truck.label,
                    truck.departureMs
                  )
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="text"
                      value={truck.label}
                      onChange={(e) =>
                        onTrucksChange(trucks.map((t) => (t.id === truck.id ? { ...t, label: e.target.value } : t)))
                      }
                      className="w-20 text-xs px-1 py-0.5 rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                      aria-label="Truck name"
                    />
                    <input
                      type="text"
                      value={truck.carrier}
                      onChange={(e) =>
                        onTrucksChange(trucks.map((t) => (t.id === truck.id ? { ...t, carrier: e.target.value } : t)))
                      }
                      className="w-24 text-xs px-1 py-0.5 rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                      aria-label="Carrier"
                    />
                  </span>
                )}
              </span>
              {isEditing ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="datetime-local"
                    defaultValue={msToDatetimeLocal(truck.departureMs)}
                    onBlur={(e) => handleDepartureChange(truck.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleDepartureChange(truck.id, (e.target as HTMLInputElement).value);
                        setEditingId(null);
                      }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    className="rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-1 py-0.5"
                    aria-label="Departure time"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-xs font-medium px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                  >
                    Done
                  </button>
                </span>
              ) : (
                <>
                  <span
                    className={`tabular-nums cursor-pointer hover:underline ${
                      urgency === 'departed'
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                    onClick={() => setEditingId(truck.id)}
                    title="Click to edit departure time"
                  >
                    {formatCountdown(msUntil)}
                  </span>
                  {!isDeparted && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        markDeparted(truck.id);
                      }}
                      className="inline-flex items-center justify-center w-5 h-5 rounded border border-emerald-500 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-xs font-bold"
                      title="Mark as departed"
                      aria-label="Mark as departed"
                    >
                      ✓
                    </button>
                  )}
                  <button
                type="button"
                aria-label={`Cancel ${formatTruckDisplayLabel(TRUCK_CARRIER_TO_DISPLAY[truck.carrier] ?? truck.carrier, truck.label, truck.departureMs)}`}
                onClick={() => handleCancel(truck.id)}
                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-red-600 dark:hover:text-red-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
                </>
              )}
            </div>
          );
        })}
        {cancelledTrucks.length > 0 && (
          <details className="inline-block">
            <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer list-none">
              Cancelled ({cancelledTrucks.length})
            </summary>
            <div className="flex flex-wrap gap-1 mt-1">
              {cancelledTrucks.map((truck) => (
                <div
                  key={truck.id}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-2 py-1 text-xs opacity-80"
                >
                  <span className="text-slate-500 dark:text-slate-400 line-through">
                    {formatTruckDisplayLabel(TRUCK_CARRIER_TO_DISPLAY[truck.carrier] ?? truck.carrier, truck.label, truck.departureMs)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Restore ${formatTruckDisplayLabel(TRUCK_CARRIER_TO_DISPLAY[truck.carrier] ?? truck.carrier, truck.label, truck.departureMs)}`}
                    onClick={() => handleRestore(truck.id)}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
        {departedTrucks.length > 0 && (
          <details className="inline-block">
            <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer list-none">
              Departed ({departedTrucks.length})
            </summary>
            <div className="flex flex-wrap gap-1 mt-1">
              {departedTrucks.map((truck) => (
                <div
                  key={truck.id}
                  className={`inline-flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${URGENCY_CLASSES.departed} opacity-90`}
                >
                  <span
                    className="font-medium text-slate-600 dark:text-slate-300 line-through cursor-pointer"
                    onClick={() => setEditingId(truck.id)}
                    title="Click to edit truck"
                  >
                    {editingId === truck.id ? (
                      <span className="inline-flex items-center gap-1 line-through">
                        <input
                          type="text"
                          value={truck.label}
                          onChange={(e) =>
                            onTrucksChange(
                              trucks.map((t) => (t.id === truck.id ? { ...t, label: e.target.value } : t))
                            )
                          }
                          className="w-20 text-xs px-1 py-0.5 rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                          aria-label="Truck name"
                        />
                        <input
                          type="text"
                          value={truck.carrier}
                          onChange={(e) =>
                            onTrucksChange(
                              trucks.map((t) => (t.id === truck.id ? { ...t, carrier: e.target.value } : t))
                            )
                          }
                          className="w-24 text-xs px-1 py-0.5 rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                          aria-label="Carrier"
                        />
                      </span>
                    ) : (
                      formatTruckDisplayLabel(
                        TRUCK_CARRIER_TO_DISPLAY[truck.carrier] ?? truck.carrier,
                        truck.label,
                        truck.departureMs
                      )
                    )}
                  </span>
                  {editingId === truck.id ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="datetime-local"
                        defaultValue={msToDatetimeLocal(truck.departureMs)}
                        onBlur={(e) => handleDepartureChange(truck.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleDepartureChange(truck.id, (e.target as HTMLInputElement).value);
                            setEditingId(null);
                          }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="rounded border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-1 py-0.5"
                        aria-label="Departure time"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs font-medium px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-100"
                      >
                        Done
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Mark ${truck.label} as present`}
                      onClick={() => {
                        setEditingId(null);
                        markPresent(truck.id);
                      }}
                      className="inline-flex items-center justify-center w-5 h-5 rounded border border-emerald-500 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-xs font-bold"
                      title="Cancel departed"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default TruckScheduleStrip;
