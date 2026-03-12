/** Single truck in the schedule with editable departure and cancellation. */
export interface TruckScheduleItem {
  id: string;
  label: string;
  departureMs: number;
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
