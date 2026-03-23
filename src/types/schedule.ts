/** Single truck in the schedule with editable name, time, carrier, and cancellation. */
export interface TruckScheduleItem {
  id: string;
  /** Display name (e.g. "Truck 1") */
  label: string;
  departureMs: number;
  /** Carrier key (e.g. DHL_FREIGHT, GEODIS) - used for Gantt and cutoffs */
  carrier: string;
  cancelled: boolean;
}

/** Pace health: on track, at risk, or behind. */
export type PaceStatus = 'on_track' | 'at_risk' | 'behind';

/** Per-carrier stats for the grid: pallets, burn rate, projection, pace. */
export interface CarrierStats {
  carrier: string;
  confirmedPallets: number;
  burnRatePalletsPerHour: number;
  projectedPalletsByCutoff: number;
  targetPalletsByCutoff: number;
  paceStatus: PaceStatus;
  /** Cutoff time (ms) used for projection. */
  cutoffMs: number | null;
}

/** KPI thresholds per carrier for row color status in the Gantt view. */
export interface CarrierKpiThresholds {
  /** Warning threshold (yellow) for pallets with status != shipped. */
  notShippedYellow: number;
  /** Critical threshold (red) for pallets with status != shipped. */
  notShippedRed: number;
  /** Warning threshold (yellow) for pallets packed in the last hour. */
  packedLastHourYellow: number;
  /** Critical threshold (red) for pallets packed in the last hour. */
  packedLastHourRed: number;
}

/** Alert kinds for the alert panel. */
export type AlertKind =
  | 'burn_rate_drop'
  | 'projection_weak'
  | 'truck_departed_with_packing';

export interface AlertItem {
  id: string;
  kind: AlertKind;
  carrier?: string;
  truckLabel?: string;
  message: string;
  atMs: number;
}
