/** Map truck schedule carrier keys to display names (match CarrierStats.carrier). */
export const TRUCK_CARRIER_TO_DISPLAY: Record<string, string> = {
  GEODIS: 'GEODIS',
  KN_AIR: 'KN Air',
  EXPEDITORS: 'EXPEDITORS',
  DHL_FREIGHT: 'DHL Freight',
  DHL: 'DHL',
};

/** Format truck for display: "CARRIER NAME TIME" e.g. "DHL Truck 1 13:00". */
export function formatTruckDisplayLabel(
  carrierDisplay: string,
  name: string,
  timeOrMs: string | number
): string {
  const time =
    typeof timeOrMs === 'number'
      ? new Date(timeOrMs).toTimeString().slice(0, 5)
      : timeOrMs;
  return `${carrierDisplay} ${name} ${time}`;
}

export interface TruckDeparture {
  name: string;
  time: string;
  carrier: string;
  /** Display carrier name (for matching stats) */
  carrierDisplay: string;
  /** Timestamp (ms) for today */
  departureMs: number;
  /** Truck number for label (1, 2, 3...) */
  truckNumber: number;
}

export interface CarrierCutoffWindow {
  startMs: number;
  endMs: number;
}

/** Parse "HH:mm" or "H:mm" to ms since midnight, then add to today. */
function parseTimeToTodayMs(timeStr: string): number {
  const [h, m] = timeStr.trim().split(':').map((s) => parseInt(s, 10) || 0);
  const today = new Date();
  today.setHours(h, m, 0, 0);
  return today.getTime();
}

/** All truck departures with timestamps (for today). */
export function getTruckDepartures(): TruckDeparture[] {
  return TRUCK_SCHEDULE.map((t, idx) => {
    const departureMs = parseTimeToTodayMs(t.time);
    // If parsed time is before now and we're past midnight, it might be next day - keep as is for display
    const carrierDisplay = TRUCK_CARRIER_TO_DISPLAY[t.carrier] ?? t.carrier;
    const numMatch = t.name.match(/Truck\s*(\d+)/i) ?? [null, String(idx + 1)];
    const truckNumber = parseInt(numMatch[1] ?? '1', 10);
    return {
      name: t.name,
      time: t.time,
      carrier: t.carrier,
      carrierDisplay,
      departureMs,
      truckNumber,
    };
  });
}

function toTodayMs(hour: number, minute: number): number {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/** Default dispatch windows (start/end) per carrier, based on agreed cutoffs. */
export function getDefaultCutoffsByCarrier(): Record<string, CarrierCutoffWindow> {
  return {
    GEODIS: { startMs: toTodayMs(6, 0), endMs: toTodayMs(12, 0) },
    'KN Air': { startMs: toTodayMs(12, 30), endMs: toTodayMs(15, 30) },
    EXPEDITORS: { startMs: toTodayMs(10, 30), endMs: toTodayMs(19, 0) },
    'DHL Freight': { startMs: toTodayMs(11, 30), endMs: toTodayMs(19, 0) },
    DHL: { startMs: toTodayMs(6, 0), endMs: toTodayMs(16, 30) },
  };
}

/** Editable truck item shape (name/label, time/departureMs, carrier). */
export interface TruckScheduleItemInput {
  label: string;
  departureMs: number;
  carrier: string;
  /** When true, truck is cancelled and excluded from Gantt. */
  cancelled?: boolean;
}

/** Convert editable truck items to TruckDeparture[] for Gantt. */
export function trucksToDepartures(
  items: TruckScheduleItemInput[],
  cancelled?: (item: TruckScheduleItemInput) => boolean
): TruckDeparture[] {
  const filtered = cancelled
    ? items.filter((t) => !cancelled(t))
    : items;
  const byCarrier = new Map<string, { item: TruckScheduleItemInput; carrierDisplay: string }[]>();
  for (const t of filtered) {
    const carrierDisplay = TRUCK_CARRIER_TO_DISPLAY[t.carrier] ?? t.carrier;
    const list = byCarrier.get(carrierDisplay) ?? [];
    list.push({ item: t, carrierDisplay });
    byCarrier.set(carrierDisplay, list);
  }
  const result: TruckDeparture[] = [];
  for (const [, list] of byCarrier) {
    list.sort((a, b) => a.item.departureMs - b.item.departureMs);
    list.forEach(({ item: t, carrierDisplay }, i) => {
      const numMatch = t.label.match(/Truck\s*(\d+)/i);
      const truckNumber = numMatch ? parseInt(numMatch[1], 10) : i + 1;
      result.push({
        name: t.label,
        time: new Date(t.departureMs).toTimeString().slice(0, 5),
        carrier: t.carrier,
        carrierDisplay,
        departureMs: t.departureMs,
        truckNumber,
      });
    });
  }
  result.sort((a, b) => a.departureMs - b.departureMs);
  return result;
}

/** Predicate: true = item is cancelled (excluded from cutoffs). */
export type TruckCancelledPredicate = (item: TruckScheduleItemInput) => boolean;

/** Cutoffs per carrier from editable truck items (latest departure per carrier). */
export function getCutoffsByCarrierFromTrucks(
  items: TruckScheduleItemInput[],
  cancelled?: TruckCancelledPredicate
): Record<string, number> {
  const filtered = cancelled ? items.filter((t) => !cancelled(t)) : items;
  const out: Record<string, number> = {};
  for (const t of filtered) {
    const display = TRUCK_CARRIER_TO_DISPLAY[t.carrier] ?? t.carrier;
    const prev = out[display];
    if (prev == null || t.departureMs > prev) out[display] = t.departureMs;
  }
  return out;
}

export const TRUCK_SCHEDULE = [{
    name: 'Truck 1',
    time: '10:00',
    carrier: 'GEODIS',
},{
    name: 'Truck 2',
    time: '14:00',
    carrier: 'GEODIS',
},{
    name: 'Truck 1',
    time: '17:00',
    carrier: 'KN_AIR',
},{
    name: 'Truck 2',
    time: '17:30',
    carrier: 'KN_AIR',
},{
    name: 'Truck 1',
    time: '15:00',
    carrier: 'EXPEDITORS',
},{
    name: 'Truck 2',
    time: '21:00',
    carrier: 'EXPEDITORS',
},{
    name: 'Truck 1',
    time: '16:00',
    carrier: 'DHL_FREIGHT',
},{
    name: 'Truck 2',
    time: '18:00',
    carrier: 'DHL_FREIGHT',
},{
    name: 'Truck 3',
    time: '21:00',
    carrier: 'DHL_FREIGHT',
},{
    name: 'Truck 1',
    time: '10:30',
    carrier: 'DHL',
},{
    name: 'Truck 2',
    time: '13:00',
    carrier: 'DHL',
},{
    name: 'Truck 3',
    time: '16:00',
    carrier: 'DHL',
},{
    name: 'Truck 4',
    time: '18:30',
    carrier: 'DHL',
},
]