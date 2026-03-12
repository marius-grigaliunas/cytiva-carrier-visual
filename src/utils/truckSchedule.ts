/** Map truck schedule carrier keys to display names (match CarrierStats.carrier). */
export const TRUCK_CARRIER_TO_DISPLAY: Record<string, string> = {
  GEODIS: 'GEODIS',
  KN_AIR: 'KN Air',
  EXPEDITORS: 'EXPEDITORS',
  DHL_FREIGHT: 'DHL Freight',
  DHL: 'DHL',
};

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

/** Default cutoff (ms) per carrier = latest truck departure for that carrier. */
export function getDefaultCutoffsByCarrier(): Record<string, number> {
  const departures = getTruckDepartures();
  const out: Record<string, number> = {};
  for (const d of departures) {
    const prev = out[d.carrierDisplay];
    if (prev == null || d.departureMs > prev) out[d.carrierDisplay] = d.departureMs;
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
    time: '12:00',
    carrier: 'KN_AIR',
},{
    name: 'Truck 2',
    time: '19:00',
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