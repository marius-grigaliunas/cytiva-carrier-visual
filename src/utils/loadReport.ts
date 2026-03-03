import * as XLSX from 'xlsx';
import { getCarrierFromShipMethod } from './carriers.ts';

export type ReportRow = Record<string, string | number | undefined>;

const SHIP_METHOD_HEADERS = [
  'ship method',
  'shipmethod',
  'ship_method',
  'carrier',
  'ship mode',
  'shipmode',
  'shipping method',
  'shippingmethod',
];

const DELIVERY_ID_HEADERS = [
  'delivery id',
  'deliveryid',
  'delivery_id',
  'shipment id',
  'shipmentid',
  'shipment_id',
  'order id',
  'orderid',
  'order_id',
  'tracking number',
  'trackingnumber',
  'tracking_id',
  'delivery number',
  'deliverynumber',
];

/** Possible values for Next Outbound Step (exact strings from report). */
export const STEP_STATUSES = [
  'Ship Confirm',
  'Firm Contents',
  'Packing',
  'Dispatch',
  'Picking',
] as const;

const STEP_COLUMN_HEADERS = [
  'next outbound step',
  'nextoutboundstep',
  'next_outbound_step',
  'outbound step',
  'outboundstep',
  'step',
];

function findShipMethodColumn(headers: string[]): number {
  const normalized = headers.map((h) => String(h).toLowerCase().trim());
  const idx = normalized.findIndex((h) =>
    SHIP_METHOD_HEADERS.some((key) => h.includes(key) || key.includes(h))
  );
  return idx >= 0 ? idx : 0;
}

function findDeliveryIdColumn(headers: string[]): number {
  const normalized = headers.map((h) => String(h).toLowerCase().trim().replace(/\s+/g, ' '));
  const idx = normalized.findIndex((h) =>
    DELIVERY_ID_HEADERS.some((key) => h.includes(key) || key.replace(/\s+/g, ' ').includes(h))
  );
  return idx >= 0 ? idx : -1;
}

function findStepColumn(headers: string[]): number {
  const normalized = headers.map((h) => String(h).toLowerCase().trim().replace(/\s+/g, ' '));
  const idx = normalized.findIndex((h) =>
    STEP_COLUMN_HEADERS.some((key) => h.includes(key) || key.replace(/\s+/g, ' ').includes(h))
  );
  return idx >= 0 ? idx : -1;
}

/**
 * Fetches the Excel report from the given URL, parses the first sheet,
 * and returns rows plus the ship method and delivery ID column keys.
 */
export async function loadReportFromUrl(
  url: string
): Promise<{ rows: ReportRow[]; shipMethodKey: string; deliveryIdKey: string; stepKey: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load report: ${res.status} ${res.statusText}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(
      'Report file not found. Place report.xlsx in public/data/ or use "Choose Excel file" to select it.'
    );
  }
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json<ReportRow>(sheet, { defval: undefined });
  if (data.length === 0) return { rows: [], shipMethodKey: '', deliveryIdKey: '', stepKey: '' };
  const headers = Object.keys(data[0] as object);
  const shipMethodIdx = findShipMethodColumn(headers);
  const shipMethodKey = headers[shipMethodIdx] ?? headers[0] ?? '';
  const deliveryIdIdx = findDeliveryIdColumn(headers);
  const deliveryIdKey = deliveryIdIdx >= 0 ? headers[deliveryIdIdx] ?? '' : '';
  const stepIdx = findStepColumn(headers);
  const stepKey = stepIdx >= 0 ? headers[stepIdx] ?? '' : '';
  return { rows: data, shipMethodKey, deliveryIdKey, stepKey };
}

export type DeliveryCountByCarrier = { carrier: string; count: number };

/**
 * Aggregates by carrier using the ship method column.
 * When deliveryIdKey is provided, counts unique deliveries (one per delivery ID) per carrier.
 * Otherwise counts lines (rows) per carrier.
 */
export function deliveriesByCarrier(
  rows: ReportRow[],
  shipMethodKey: string,
  deliveryIdKey: string
): DeliveryCountByCarrier[] {
  const byCarrier: Record<string, Set<string>> = {};
  const add = (carrier: string, id: string) => {
    if (!byCarrier[carrier]) byCarrier[carrier] = new Set();
    byCarrier[carrier].add(id);
  };
  rows.forEach((row, i) => {
    const value = row[shipMethodKey];
    const carrier = getCarrierFromShipMethod(value != null ? String(value) : '');
    const id =
      deliveryIdKey && row[deliveryIdKey] != null && String(row[deliveryIdKey]).trim() !== ''
        ? String(row[deliveryIdKey]).trim()
        : `__row_${i}`;
    add(carrier, id);
  });
  return Object.entries(byCarrier).map(([carrier, set]) => ({
    carrier,
    count: set.size,
  }));
}

/**
 * Returns the number of unique deliveries when deliveryIdKey is set, otherwise row count.
 * Rows with empty delivery ID are counted as one delivery each.
 */
export function uniqueDeliveryCount(
  rows: ReportRow[],
  deliveryIdKey: string
): number {
  if (!deliveryIdKey) return rows.length;
  const set = new Set<string>();
  rows.forEach((row, i) => {
    const v = row[deliveryIdKey];
    const id =
      v != null && String(v).trim() !== '' ? String(v).trim() : `__row_${i}`;
    set.add(id);
  });
  return set.size;
}

export type LinesByStep = { step: string; count: number }[];

/**
 * Counts lines per step status (Next Outbound Step). Uses the canonical step order.
 * Rows with unknown or empty step are grouped under "Other".
 */
export function linesByStep(
  rows: ReportRow[],
  stepKey: string
): LinesByStep {
  const counts: Record<string, number> = {};
  const known = new Set(STEP_STATUSES);
  for (const row of rows) {
    const raw = row[stepKey];
    const step =
      raw != null && String(raw).trim() !== ''
        ? String(raw).trim()
        : 'Other';
    const key = known.has(step as (typeof STEP_STATUSES)[number]) ? step : 'Other';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const result: LinesByStep = STEP_STATUSES.map((step) => ({
    step,
    count: counts[step] ?? 0,
  }));
  if ((counts['Other'] ?? 0) > 0) result.push({ step: 'Other', count: counts['Other'] ?? 0 });
  return result;
}
