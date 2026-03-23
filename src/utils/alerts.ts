import type { ReportRow } from './loadReport';
import { getCarrierFromShipMethod } from './carriers';
import type { TruckScheduleItem } from '../types/schedule';
import type { AlertItem, CarrierStats } from '../types/schedule';

/** Carriers that have lines in Packing step. */
function carriersWithPacking(
  rows: ReportRow[],
  shipMethodKey: string,
  stepKey: string
): Set<string> {
  const set = new Set<string>();
  const packing = 'Packing';
  for (const row of rows) {
    const step = row[stepKey] != null ? String(row[stepKey]).trim() : '';
    if (step !== packing) continue;
    const carrier = getCarrierFromShipMethod(
      row[shipMethodKey] != null ? String(row[shipMethodKey]) : ''
    );
    set.add(carrier);
  }
  return set;
}

export interface AlertsInput {
  rows: ReportRow[];
  shipMethodKey: string;
  stepKey: string;
  /**
   * Trucks confirmed as "departed" by the user.
   * (We use this instead of `departureMs <= now`.)
   */
  trucks: TruckScheduleItem[];
  carrierStats: CarrierStats[];
  /** Previous period burn rate per carrier for drop detection. */
  previousBurnRateByCarrier: Record<string, number>;
  nowMs: number;
}

/**
 * Generates alerts: burn rate drop, weak projection, truck departed with orders in packing.
 */
export function computeAlerts(input: AlertsInput): AlertItem[] {
  const {
    rows,
    shipMethodKey,
    stepKey,
    trucks,
    carrierStats,
    previousBurnRateByCarrier,
    nowMs,
  } = input;

  const alerts: AlertItem[] = [];
  let id = 0;
  const nextId = () => `alert-${++id}`;

  const packingCarriers = stepKey ? carriersWithPacking(rows, shipMethodKey, stepKey) : new Set<string>();

  // Burn rate dropped sharply (current < 50% of previous)
  for (const s of carrierStats) {
    const prev = previousBurnRateByCarrier[s.carrier] ?? 0;
    if (prev > 0 && s.burnRatePalletsPerHour < prev * 0.5) {
      alerts.push({
        id: nextId(),
        kind: 'burn_rate_drop',
        carrier: s.carrier,
        message: `Burn rate dropped sharply for ${s.carrier} (${s.burnRatePalletsPerHour.toFixed(1)}/hr vs ${prev.toFixed(1)}/hr)`,
        atMs: nowMs,
      });
    }
  }

  // Projection weak relative to cutoff
  for (const s of carrierStats) {
    if (s.cutoffMs == null || s.cutoffMs <= nowMs) continue;
    if (s.targetPalletsByCutoff <= 0) continue;
    const ratio = s.projectedPalletsByCutoff / s.targetPalletsByCutoff;
    if (ratio < 0.7) {
      alerts.push({
        id: nextId(),
        kind: 'projection_weak',
        carrier: s.carrier,
        message: `Projection weak for ${s.carrier} (${s.projectedPalletsByCutoff.toFixed(1)} vs target ${s.targetPalletsByCutoff.toFixed(1)})`,
        atMs: nowMs,
      });
    }
  }

  // Truck departed with orders still in packing for that carrier
  // (We only consider trucks confirmed as "departed" by the user.)
  const hasDepartedTruck = trucks.some((t) => !t.cancelled);
  if (hasDepartedTruck && packingCarriers.size > 0) {
    for (const carrier of packingCarriers) {
      const hasOrders = carrierStats.some(
        (s) => s.carrier === carrier && (s.confirmedPallets > 0 || s.burnRatePalletsPerHour > 0)
      );
      if (!hasOrders) continue;
      alerts.push({
        id: nextId(),
        kind: 'truck_departed_with_packing',
        carrier,
        message: `A truck has departed; ${carrier} still has orders in packing`,
        atMs: nowMs,
      });
    }
  }

  return alerts;
}
