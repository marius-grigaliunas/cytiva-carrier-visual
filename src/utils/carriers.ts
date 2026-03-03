/**
 * Carrier prefixes used to bucket ship methods into the 5 main carriers.
 * Order matters: longer prefixes (e.g. DHLFRT_) should be checked before DHL_.
 */
export const CARRIER_PREFIXES = [
  'DHLFRT_',
  'DHL_',
  'EXPEDITORS_',
  'KN_AIR',
  'GEODIS_',
] as const;

export const CARRIER_LABELS: Record<string, string> = {
  DHLFRT: 'DHL Freight',
  DHL: 'DHL',
  EXPEDITORS: 'EXPEDITORS',
  KN_AIR: 'KN Air',
  GEODIS: 'GEODIS',
};

/**
 * Maps a ship method string (e.g. "DHL_AIR_ECX") to one of the 5 main carriers or "Other".
 */
export function getCarrierFromShipMethod(shipMethod: string | undefined | null): string {
  if (shipMethod == null || String(shipMethod).trim() === '') return 'Other';
  const s = String(shipMethod).trim().toUpperCase();
  for (const prefix of CARRIER_PREFIXES) {
    const prefixNorm = prefix.endsWith('_') ? prefix : prefix + '_';
    if (s.startsWith(prefixNorm) || s.startsWith(prefix)) {
      const key = prefix.replace(/_$/, '');
      return CARRIER_LABELS[key] ?? key;
    }
  }
  return 'Other';
}

/**
 * All display carrier names (5 main + Other), in display order.
 */
export function getCarrierOrder(): string[] {
  const main = CARRIER_PREFIXES.map((p) => {
    const key = p.replace(/_$/, '');
    return CARRIER_LABELS[key] ?? key;
  });
  return [...main, 'Other'];
}
