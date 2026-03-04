import type { ReportRow } from './loadReport';

/**
 * Parcel container: CC-P* or CC*, excluding CC-PALL*, CC-BPALL*, CC-PF*.
 */
export function isParcelContainerType(containerType: string | number | undefined): boolean {
  const t = String(containerType ?? '').trim().toUpperCase();
  if (!t.startsWith('CC-')) return false;
  const suffix = t.slice(3);
  if (suffix.startsWith('PALL')) return false;
  if (suffix.startsWith('BPALL')) return false;
  if (suffix.startsWith('PF')) return false;
  return true;
}

/**
 * Pallet container: CC-PALL*, CC-BPALL*, or CC-PF*.
 */
export function isPalletContainerType(containerType: string | number | undefined): boolean {
  const t = String(containerType ?? '').trim().toUpperCase();
  if (!t.startsWith('CC-')) return false;
  const suffix = t.slice(3);
  return suffix.startsWith('PALL') || suffix.startsWith('BPALL') || suffix.startsWith('PF');
}

/**
 * Count distinct parcels for a delivery. A parcel is a row with a parcel container type
 * (CC-P* or CC*, excluding CC-PALL*, CC-BPALL*, CC-PF*); parcels are distinguished by
 * distinct "Outermost LPN" values.
 */
export function countParcelsForDelivery(
  rows: ReportRow[],
  deliveryIdKey: string,
  deliveryId: string,
  containerTypeKey: string,
  outermostLpnKey: string
): number {
  if (!containerTypeKey || !outermostLpnKey) return 0;
  const lpns = new Set<string>();
  for (const row of rows) {
    const rowDeliveryId =
      row[deliveryIdKey] != null && String(row[deliveryIdKey]).trim() !== ''
        ? String(row[deliveryIdKey]).trim()
        : null;
    if (rowDeliveryId !== deliveryId) continue;
    if (!isParcelContainerType(row[containerTypeKey])) continue;
    const lpn = row[outermostLpnKey];
    if (lpn != null && String(lpn).trim() !== '') {
      lpns.add(String(lpn).trim());
    }
  }
  return lpns.size;
}

/**
 * Count distinct pallets for a delivery. A pallet is a row with a pallet container type
 * (CC-PALL*, CC-BPALL*, or CC-PF*); pallets are distinguished by distinct "Outermost LPN" values.
 */
export function countPalletsForDelivery(
  rows: ReportRow[],
  deliveryIdKey: string,
  deliveryId: string,
  containerTypeKey: string,
  outermostLpnKey: string
): number {
  if (!containerTypeKey || !outermostLpnKey) return 0;
  const lpns = new Set<string>();
  for (const row of rows) {
    const rowDeliveryId =
      row[deliveryIdKey] != null && String(row[deliveryIdKey]).trim() !== ''
        ? String(row[deliveryIdKey]).trim()
        : null;
    if (rowDeliveryId !== deliveryId) continue;
    if (!isPalletContainerType(row[containerTypeKey])) continue;
    const lpn = row[outermostLpnKey];
    if (lpn != null && String(lpn).trim() !== '') {
      lpns.add(String(lpn).trim());
    }
  }
  return lpns.size;
}

/**
 * Parse a timestamp from report (string like "2026-01-01 16:00" or Excel serial).
 * Returns ms since epoch or NaN if unparseable.
 */
function parseTimestamp(value: string | number | undefined): number {
  if (value == null) return NaN;
  if (typeof value === 'number') {
    if (value < 1) return NaN;
    // Excel serial: 1 = 1900-01-01, epoch = 1899-12-31 00:00
    const excelEpoch = new Date(1899, 11, 31).getTime();
    return excelEpoch + value * 24 * 60 * 60 * 1000;
  }
  const s = String(value).trim();
  if (!s) return NaN;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;
  const iso = s.replace(/\s+/, 'T');
  return Date.parse(iso);
}

/**
 * Format milliseconds as human-readable duration (e.g. "2h 30m", "1d 5h").
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const parts: string[] = [];
  if (day > 0) parts.push(`${day}d`);
  if (hr % 24 > 0) parts.push(`${hr % 24}h`);
  if (day === 0 && min % 60 > 0) parts.push(`${min % 60}m`);
  if (parts.length === 0) parts.push(sec % 60 > 0 ? `${sec}s` : '0m');
  return parts.join(' ');
}

/**
 * For a delivery, the "Dispatch to picking" value is the longest time interval between
 * current time and "Dispatched Timestamp (GMT)", considering only lines that have
 * "Dispatched Timestamp (GMT)" set and no "Drop Off Timestamp (GMT)".
 * Returns duration in ms, or null if no such lines.
 */
export function maxDispatchToPickingMsForDelivery(
  rows: ReportRow[],
  deliveryIdKey: string,
  deliveryId: string,
  dispatchedTimestampKey: string,
  dropOffTimestampKey: string
): number | null {
  if (!dispatchedTimestampKey) return null;
  const now = Date.now();
  const deliveryIdNorm = String(deliveryId).trim();
  let maxMs: number | null = null;
  for (const row of rows) {
    const rawId = row[deliveryIdKey];
    const rowDeliveryId =
      rawId != null && String(rawId).trim() !== ''
        ? String(rawId).trim()
        : null;
    if (rowDeliveryId === null || rowDeliveryId !== deliveryIdNorm) continue;
    // Only skip lines that have a real drop-off timestamp (parses as a date).
    // Empty, "-", "N/A", or other placeholders count as "no drop off".
    if (dropOffTimestampKey) {
      const dropOff = row[dropOffTimestampKey];
      if (dropOff != null && String(dropOff).trim() !== '') {
        const dropOffMs = parseTimestamp(dropOff);
        if (Number.isFinite(dropOffMs)) continue;
      }
    }
    const dispatched = row[dispatchedTimestampKey];
    if (dispatched == null || String(dispatched).trim() === '') continue;
    const dispatchedMs = parseTimestamp(dispatched);
    if (Number.isNaN(dispatchedMs)) continue;
    const intervalMs = now - dispatchedMs;
    if (intervalMs < 0) continue;
    if (maxMs === null || intervalMs > maxMs) maxMs = intervalMs;
  }
  return maxMs;
}
