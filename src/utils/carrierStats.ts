import type { ReportRow } from './loadReport';
import { getCarrierFromShipMethod, getCarrierOrder } from './carriers';
import { isPalletContainerType } from './tableHeaderFormulas';
import type { CarrierStats, PaceStatus } from '../types/schedule';

function parseTimestamp(value: string | number | undefined): number {
  if (value == null) return NaN;
  if (typeof value === 'number') {
    if (value < 1) return NaN;
    const excelEpoch = new Date(1899, 11, 31).getTime();
    return excelEpoch + value * 24 * 60 * 60 * 1000;
  }
  const s = String(value).trim();
  if (!s) return NaN;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;
  return Date.parse(s.replace(/\s+/, 'T'));
}

/** Count distinct pallets per carrier (pallet container types, distinct LPN). */
function confirmedPalletsByCarrier(
  rows: ReportRow[],
  shipMethodKey: string,
  containerTypeKey: string,
  outermostLpnKey: string
): Record<string, number> {
  const byCarrier: Record<string, Set<string>> = {};
  for (const row of rows) {
    const carrier = getCarrierFromShipMethod(
      row[shipMethodKey] != null ? String(row[shipMethodKey]) : ''
    );
    if (!isPalletContainerType(row[containerTypeKey])) continue;
    const lpn = row[outermostLpnKey];
    if (lpn == null || String(lpn).trim() === '') continue;
    if (!byCarrier[carrier]) byCarrier[carrier] = new Set();
    byCarrier[carrier].add(String(lpn).trim());
  }
  const out: Record<string, number> = {};
  for (const [c, set] of Object.entries(byCarrier)) out[c] = set.size;
  return out;
}

/** Pallets per hour in the last 60 minutes (from dispatched timestamp), per carrier. */
function burnRateLastHour(
  rows: ReportRow[],
  shipMethodKey: string,
  containerTypeKey: string,
  outermostLpnKey: string,
  dispatchedTimestampKey: string,
  dropOffTimestampKey: string,
  nowMs: number
): Record<string, number> {
  const windowStart = nowMs - 60 * 60 * 1000;
  const byCarrier: Record<string, Set<string>> = {};
  for (const row of rows) {
    const carrier = getCarrierFromShipMethod(
      row[shipMethodKey] != null ? String(row[shipMethodKey]) : ''
    );
    if (!isPalletContainerType(row[containerTypeKey])) continue;
    const lpn = row[outermostLpnKey];
    if (lpn == null || String(lpn).trim() === '') continue;
    if (!dispatchedTimestampKey) continue;
    const dispatched = row[dispatchedTimestampKey];
    if (dispatched == null || String(dispatched).trim() === '') continue;
    const dispatchedMs = parseTimestamp(dispatched);
    if (Number.isNaN(dispatchedMs) || dispatchedMs < windowStart || dispatchedMs > nowMs) continue;
    if (dropOffTimestampKey) {
      const dropOff = row[dropOffTimestampKey];
      if (dropOff != null && String(dropOff).trim() !== '') {
        const dropOffMs = parseTimestamp(dropOff);
        if (Number.isFinite(dropOffMs)) continue;
      }
    }
    if (!byCarrier[carrier]) byCarrier[carrier] = new Set();
    byCarrier[carrier].add(String(lpn).trim());
  }
  const out: Record<string, number> = {};
  for (const [c, set] of Object.entries(byCarrier)) out[c] = set.size;
  return out;
}

function paceStatus(projected: number, target: number): PaceStatus {
  if (target <= 0) return 'on_track';
  const ratio = projected / target;
  if (ratio >= 1) return 'on_track';
  if (ratio >= 0.7) return 'at_risk';
  return 'behind';
}

export interface CarrierStatsInput {
  rows: ReportRow[];
  shipMethodKey: string;
  containerTypeKey: string;
  outermostLpnKey: string;
  dispatchedTimestampKey: string;
  dropOffTimestampKey: string;
  cutoffMs: number | null;
  nowMs: number;
}

export function computeCarrierStats(input: CarrierStatsInput): CarrierStats[] {
  const {
    rows,
    shipMethodKey,
    containerTypeKey,
    outermostLpnKey,
    dispatchedTimestampKey,
    dropOffTimestampKey,
    cutoffMs,
    nowMs,
  } = input;

  const confirmed = confirmedPalletsByCarrier(
    rows,
    shipMethodKey,
    containerTypeKey,
    outermostLpnKey
  );
  const burnRates = burnRateLastHour(
    rows,
    shipMethodKey,
    containerTypeKey,
    outermostLpnKey,
    dispatchedTimestampKey,
    dropOffTimestampKey,
    nowMs
  );

  const order = getCarrierOrder();
  const carriers = new Set<string>([...Object.keys(confirmed), ...order]);
  const hoursUntilCutoff =
    cutoffMs != null && cutoffMs > nowMs
      ? (cutoffMs - nowMs) / (60 * 60 * 1000)
      : 0;

  const result: CarrierStats[] = [];
  for (const carrier of order) {
    if (!carriers.has(carrier) && result.length > 0) continue;
    const conf = confirmed[carrier] ?? 0;
    const rate = burnRates[carrier] ?? 0;
    const projected =
      conf + (hoursUntilCutoff > 0 ? rate * hoursUntilCutoff : 0);
    const target =
      cutoffMs != null && cutoffMs > nowMs
        ? Math.max(conf, conf + rate * hoursUntilCutoff)
        : conf;
    result.push({
      carrier,
      confirmedPallets: conf,
      burnRatePalletsPerHour: rate,
      projectedPalletsByCutoff: Math.round(projected * 10) / 10,
      targetPalletsByCutoff: Math.round(target * 10) / 10,
      paceStatus: paceStatus(projected, target),
      cutoffMs,
    });
  }
  for (const carrier of carriers) {
    if (result.some((s) => s.carrier === carrier)) continue;
    const conf = confirmed[carrier] ?? 0;
    const rate = burnRates[carrier] ?? 0;
    const projected =
      conf + (hoursUntilCutoff > 0 ? rate * hoursUntilCutoff : 0);
    const target =
      cutoffMs != null && cutoffMs > nowMs
        ? Math.max(conf, conf + rate * hoursUntilCutoff)
        : conf;
    result.push({
      carrier,
      confirmedPallets: conf,
      burnRatePalletsPerHour: rate,
      projectedPalletsByCutoff: Math.round(projected * 10) / 10,
      targetPalletsByCutoff: Math.round(target * 10) / 10,
      paceStatus: paceStatus(projected, target),
      cutoffMs,
    });
  }
  return result.sort(
    (a, b) =>
      order.indexOf(a.carrier) - order.indexOf(b.carrier) ||
      a.carrier.localeCompare(b.carrier)
  );
}
