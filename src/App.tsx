import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  loadReportFromUrl,
  deliveriesByCarrier,
  uniqueDeliveryCount,
  linesByStep,
  type ReportRow,
} from './utils/loadReport';
import { countParcelsForDelivery, countPalletsForDelivery, formatDurationMs, maxDispatchToPickingMsForDelivery } from './utils/tableHeaderFormulas';
import { getCarrierOrder, getCarrierFromShipMethod } from './utils/carriers.ts';
import * as XLSX from 'xlsx';

import cytivaLogo from './assets/Cytiva.svg';
import { ResizablePanel, clampRectToBounds, clampRectNoOverlap, type PanelRect } from './ResizablePanel';

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
const DEFAULT_REPORT_URL = `${base}data/report.xlsx`

type TableColumnKey = 'delivery' | 'parcels' | 'pallets' | 'dispatchToPicking' | 'pickingToPacking' | 'packingToFirmContents';

interface TableRow {
  deliveryId: string;
  parcels: number;
  pallets: number;
  dispatchToPickingMs: number | null;
}

function getCellValue(row: TableRow, key: TableColumnKey, formatDurationMs: (ms: number) => string): string {
  switch (key) {
    case 'delivery':
      return row.deliveryId;
    case 'parcels':
      return String(row.parcels);
    case 'pallets':
      return String(row.pallets);
    case 'dispatchToPicking':
      return row.dispatchToPickingMs != null ? formatDurationMs(row.dispatchToPickingMs) : '—';
    case 'pickingToPacking':
    case 'packingToFirmContents':
      return '—';
    default:
      return '';
  }
}

const TABLE_COLUMNS: { key: TableColumnKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'delivery', label: 'Delivery', align: 'left' },
  { key: 'parcels', label: 'Number of parcels', align: 'right' },
  { key: 'pallets', label: 'Number of pallets', align: 'right' },
  { key: 'dispatchToPicking', label: 'Dispatch to picking', align: 'right' },
  { key: 'pickingToPacking', label: 'Picking to packing', align: 'right' },
  { key: 'packingToFirmContents', label: 'Packing to firm contents', align: 'right' },
];

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem('cytiva-carrier-dark');
      if (stored !== null) return stored === '1';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });
  const [shipMethodKey, setShipMethodKey] = useState('');
  const [deliveryIdKey, setDeliveryIdKey] = useState('');
  const [stepKey, setStepKey] = useState('');
  const [containerTypeKey, setContainerTypeKey] = useState('');
  const [outermostLpnKey, setOutermostLpnKey] = useState('');
  const [dispatchedTimestampKey, setDispatchedTimestampKey] = useState('');
  const [dropOffTimestampKey, setDropOffTimestampKey] = useState('');
  const [filterByCarriers, setFilterByCarriers] = useState<string[]>([]);
  const [filterBySteps, setFilterBySteps] = useState<string[]>([]);
  const [pendingCarriers, setPendingCarriers] = useState<Set<string>>(new Set());
  const [pendingSteps, setPendingSteps] = useState<Set<string>>(new Set());
  const [tableColumnFilters, setTableColumnFilters] = useState<Partial<Record<TableColumnKey, Set<string>>>>({});
  const [tableFilterPopup, setTableFilterPopup] = useState<TableColumnKey | null>(null);
  const [tableSort, setTableSort] = useState<{ key: TableColumnKey; dir: 'asc' | 'desc' } | null>(null);
  const filterPopupRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const getInitialPanelLayout = useCallback((): Record<string, PanelRect> => ({
    carrier: { x: 0, y: 0, w: 50, h: 38 },
    step: { x: 50, y: 0, w: 50, h: 38 },
    table: { x: 0, y: 38, w: 100, h: 62 },
  }), []);

  const [panelLayout, setPanelLayout] = useState<Record<string, PanelRect>>(getInitialPanelLayout);

  useEffect(() => {
    try {
      localStorage.setItem('cytiva-carrier-dark', darkMode ? '1' : '0');
    } catch {}
  }, [darkMode]);

  useEffect(() => {
    if (tableFilterPopup == null) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(e.target as Node)) {
        setTableFilterPopup(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [tableFilterPopup]);

  const rowsForCarrierChart = filterBySteps.length > 0 && stepKey
    ? rows.filter((r) => {
        const step = r[stepKey] != null ? String(r[stepKey]).trim() : '';
        return filterBySteps.includes(step);
      })
    : rows;
  const rowsForStepChart = filterByCarriers.length > 0 && shipMethodKey
    ? rows.filter((r) => {
        const carrier = getCarrierFromShipMethod(r[shipMethodKey] != null ? String(r[shipMethodKey]) : '');
        return filterByCarriers.includes(carrier);
      })
    : rows;

  const byCarrier = (() => {
    const counts = deliveriesByCarrier(rowsForCarrierChart, shipMethodKey, deliveryIdKey);
    const order = getCarrierOrder();
    return [...counts].sort((a, b) => order.indexOf(a.carrier) - order.indexOf(b.carrier));
  })();
  const byStep = stepKey ? linesByStep(rowsForStepChart, stepKey) : [];

  const rowsForTotals = (() => {
    let r = rows;
    if (filterByCarriers.length > 0 && shipMethodKey) {
      r = r.filter((row) => {
        const carrier = getCarrierFromShipMethod(row[shipMethodKey] != null ? String(row[shipMethodKey]) : '');
        return filterByCarriers.includes(carrier);
      });
    }
    if (filterBySteps.length > 0 && stepKey) {
      r = r.filter((row) => {
        const step = row[stepKey] != null ? String(row[stepKey]).trim() : '';
        return filterBySteps.includes(step);
      });
    }
    return r;
  })();

  const totalDeliveries = uniqueDeliveryCount(rowsForTotals, deliveryIdKey);
  const totalLines = rowsForTotals.length;
  const hasFilter = filterByCarriers.length > 0 || filterBySteps.length > 0;
  const inCarrierSelectionMode = pendingCarriers.size > 0;
  const inStepSelectionMode = pendingSteps.size > 0;

  const rowsForTable =
    filterByCarriers.length > 0 && shipMethodKey
      ? rows.filter((r) => {
          const carrier = getCarrierFromShipMethod(
            r[shipMethodKey] != null ? String(r[shipMethodKey]) : ''
          );
          return filterByCarriers.includes(carrier);
        })
      : rows;
  const deliveriesInTableCount = deliveryIdKey
    ? uniqueDeliveryCount(rowsForTable, deliveryIdKey)
    : 0;

  const unfilteredTableRows = useMemo((): TableRow[] => {
    if (!deliveryIdKey) return [];
    const deliveryIds = [...new Set(
      rowsForTable
        .map((r) => r[deliveryIdKey])
        .filter((id): id is string => id != null && String(id).trim() !== '')
        .map((id) => String(id).trim())
    )];
    return deliveryIds.map((deliveryId): TableRow => ({
      deliveryId,
      parcels: containerTypeKey && outermostLpnKey
        ? countParcelsForDelivery(
            rowsForTable,
            deliveryIdKey,
            deliveryId,
            containerTypeKey,
            outermostLpnKey
          )
        : 0,
      pallets: containerTypeKey && outermostLpnKey
        ? countPalletsForDelivery(
            rowsForTable,
            deliveryIdKey,
            deliveryId,
            containerTypeKey,
            outermostLpnKey
          )
        : 0,
      dispatchToPickingMs: dispatchedTimestampKey
        ? maxDispatchToPickingMsForDelivery(
            rowsForTable,
            deliveryIdKey,
            deliveryId,
            dispatchedTimestampKey,
            dropOffTimestampKey
          )
        : null,
    }));
  }, [rowsForTable, deliveryIdKey, containerTypeKey, outermostLpnKey, dispatchedTimestampKey, dropOffTimestampKey]);

  const confirmCarrierSelection = useCallback(() => {
    if (pendingCarriers.size > 0) {
      setFilterByCarriers(Array.from(pendingCarriers));
      setPendingCarriers(new Set());
    }
  }, [pendingCarriers]);

  const cancelCarrierSelection = useCallback(() => {
    setPendingCarriers(new Set());
  }, []);

  const toggleCarrierPending = useCallback((carrier: string) => {
    setPendingCarriers((prev) => {
      const next = new Set(prev);
      if (next.has(carrier)) next.delete(carrier);
      else next.add(carrier);
      return next;
    });
  }, []);

  const confirmStepSelection = useCallback(() => {
    if (pendingSteps.size > 0) {
      setFilterBySteps(Array.from(pendingSteps));
      setPendingSteps(new Set());
    }
  }, [pendingSteps]);

  const cancelStepSelection = useCallback(() => {
    setPendingSteps(new Set());
  }, []);

  const toggleStepPending = useCallback((step: string) => {
    setPendingSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  }, []);

  const handleTableSort = useCallback((key: TableColumnKey) => {
    setTableSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  }, []);

  const carrierBarsToShow =
    filterByCarriers.length > 0 && !inCarrierSelectionMode
      ? byCarrier.filter((c) => filterByCarriers.includes(c.carrier))
      : byCarrier;
  const stepBarsToShow =
    filterBySteps.length > 0 && !inStepSelectionMode
      ? byStep.filter((s) => filterBySteps.includes(s.step))
      : byStep;

  const maxCarrierDisplay = Math.max(1, ...carrierBarsToShow.map((c) => c.count));
  const maxStepDisplay = Math.max(1, ...stepBarsToShow.map((s) => s.count));

  const loadFromUrl = useCallback(async () => {
    setError(null);
    setLoading(true);
    setFilterByCarriers([]);
    setFilterBySteps([]);
    setPendingCarriers(new Set());
    setPendingSteps(new Set());
    try {
      const { rows: data, shipMethodKey: key, deliveryIdKey: didKey, stepKey: sk, containerTypeKey: ctk, outermostLpnKey: olk, dispatchedTimestampKey: dtsKey, dropOffTimestampKey: dotsKey } =
        await loadReportFromUrl(DEFAULT_REPORT_URL);
      setRows(data);
      setShipMethodKey(key);
      setDeliveryIdKey(didKey);
      setStepKey(sk);
      setContainerTypeKey(ctk ?? '');
      setOutermostLpnKey(olk ?? '');
      setDispatchedTimestampKey(dtsKey ?? '');
      setDropOffTimestampKey(dotsKey ?? '');
      setPanelLayout(getInitialPanelLayout());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
      setRows([]);
      setShipMethodKey('');
      setDeliveryIdKey('');
      setStepKey('');
      setContainerTypeKey('');
      setOutermostLpnKey('');
      setDispatchedTimestampKey('');
      setDropOffTimestampKey('');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFromFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      setLoading(true);
      setFilterByCarriers([]);
      setFilterBySteps([]);
      setPendingCarriers(new Set());
      setPendingSteps(new Set());
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const buffer = ev.target?.result;
          if (!buffer || typeof buffer === 'string') throw new Error('Invalid file');
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const data = XLSX.utils.sheet_to_json<ReportRow>(sheet, { defval: undefined });
          const headers = data.length > 0 ? Object.keys(data[0] as object) : [];
          const shipMethodKey =
            headers.find((h) =>
              /ship\s*method|carrier|ship\s*mode|shipping\s*method/i.test(h)
            ) ?? headers[0] ?? '';
          const deliveryIdKey =
            (() => {
              const lower = (s: string) => String(s).toLowerCase().trim();
              const deliveryFirst = headers.findIndex((header) => {
                const h = lower(header);
                return /delivery/.test(h) && !/detail/.test(h);
              });
              if (deliveryFirst >= 0) return headers[deliveryFirst] ?? '';
              const fallback = headers.find((h) =>
                /delivery\s*id|shipment\s*id|order\s*id|tracking\s*(number|id)/i.test(h)
              );
              return fallback ?? '';
            })();
          const stepKey =
            headers.find((h) =>
              /next\s*outbound\s*step|outbound\s*step|^step$/i.test(h)
            ) ?? '';
          const containerTypeKey =
            headers.find((h) =>
              /container\s*type|containertype|container_type|^container$/i.test(h)
            ) ?? '';
          const outermostLpnKey =
            headers.find((h) =>
              /outermost\s*lpn|outermostlpn|outermost_lpn|^lpn$/i.test(h)
            ) ?? '';
          const dispatchedTimestampKey =
            headers.find((h) => /dispatched\s*timestamp/i.test(String(h).toLowerCase().trim())) ?? '';
          const dropOffTimestampKey =
            headers.find((h) => /drop\s*off\s*timestamp/i.test(String(h).toLowerCase().trim())) ?? '';
          setRows(data);
          setShipMethodKey(shipMethodKey);
          setDeliveryIdKey(deliveryIdKey);
          setStepKey(stepKey);
          setContainerTypeKey(containerTypeKey);
          setOutermostLpnKey(outermostLpnKey);
          setDispatchedTimestampKey(dispatchedTimestampKey);
          setDropOffTimestampKey(dropOffTimestampKey);
          setPanelLayout(getInitialPanelLayout());
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse file');
          setRows([]);
          setShipMethodKey('');
          setDeliveryIdKey('');
          setStepKey('');
          setContainerTypeKey('');
          setOutermostLpnKey('');
          setDispatchedTimestampKey('');
          setDropOffTimestampKey('');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    },
    [getInitialPanelLayout]
  );

  const containerBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const MIN_PANEL_W = 15;
  const MIN_PANEL_H = 12;

  const handlePanelMove = useCallback(
    (id: string, dxPx: number, dyPx: number) => {
      const el = dashboardRef.current;
      if (!el) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (W <= 0 || H <= 0) return;
      const dxPct = (dxPx / W) * 100;
      const dyPct = (dyPx / H) * 100;
      setPanelLayout((prev) => {
        const rect = prev[id];
        if (!rect) return prev;
        const others = (Object.keys(prev) as string[])
          .filter((k) => k !== id && (k !== 'table' || deliveryIdKey))
          .map((k) => prev[k]);
        let next = {
          ...rect,
          x: rect.x + dxPct,
          y: rect.y + dyPct,
        };
        next = clampRectToBounds(next, containerBounds);
        next.w = Math.max(MIN_PANEL_W, next.w);
        next.h = Math.max(MIN_PANEL_H, next.h);
        next = clampRectNoOverlap(next, others, W, H);
        return { ...prev, [id]: next };
      });
    },
    [deliveryIdKey]
  );

  const handlePanelResize = useCallback(
    (id: string, edge: 'e' | 's' | 'se', dxPx: number, dyPx: number) => {
      const el = dashboardRef.current;
      if (!el) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (W <= 0 || H <= 0) return;
      const dxPct = (dxPx / W) * 100;
      const dyPct = (dyPx / H) * 100;
      setPanelLayout((prev) => {
        const rect = prev[id];
        if (!rect) return prev;
        const others = (Object.keys(prev) as string[])
          .filter((k) => k !== id && (k !== 'table' || deliveryIdKey))
          .map((k) => prev[k]);
        let next = { ...rect };
        if (edge === 'e' || edge === 'se') next.w = Math.max(MIN_PANEL_W, rect.w + dxPct);
        if (edge === 's' || edge === 'se') next.h = Math.max(MIN_PANEL_H, rect.h + dyPct);
        next = clampRectToBounds(next, containerBounds);
        next = clampRectNoOverlap(next, others, W, H);
        return { ...prev, [id]: next };
      });
    },
    [deliveryIdKey]
  );

  return (
    <div className={`h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 ${darkMode ? 'dark' : ''}`}>
      <header className="flex items-center gap-4 px-6 py-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <img src={cytivaLogo} alt="Cytiva logo" className="h-7 w-auto shrink-0" />
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 shrink-0">
          Carrier dashboard
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadFromUrl}
            disabled={loading}
            className="px-4 py-2 whitespace-nowrap bg-blue-600 dark:bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Loading…' : 'Load report from server'}
          </button>
          <label className="px-4 py-2 whitespace-nowrap bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-500 cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={loadFromFile}
              disabled={loading}
            />
            Choose Excel file…
          </label>
        </div>
        <div className="flex-1 min-w-0" />
        <h2 className="text-md font-semibold text-slate-700 dark:text-slate-300 shrink-0 text-right">
          Created by: <span className="font-bold">Marius Grigaliunas</span>
        </h2>
        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
          )}
        </button>
      </header>
      <main className="flex-1 min-h-0 flex flex-col p-4 md:p-6 w-full overflow-hidden">
        {shipMethodKey && (
          <div className="flex flex-wrap gap-3 items-center mb-3 shrink-0">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Ship method: <strong>{shipMethodKey}</strong>
              {deliveryIdKey && (
                <> · Delivery ID: <strong>{deliveryIdKey}</strong></>
              )}
              {stepKey && (
                <> · Step: <strong>{stepKey}</strong></>
              )}
            </span>
          </div>
        )}

        <div className="mb-3 min-h-10 flex items-center gap-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-800 px-3 shrink-0">
          {hasFilter ? (
            <>
              <span className="text-slate-600 dark:text-slate-300">Filter:</span>
              {filterByCarriers.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/50 px-2.5 py-0.5 text-blue-800 dark:text-blue-200">
                  Carriers: {filterByCarriers.join(', ')}
                  <button
                    type="button"
                    aria-label="Clear carrier filter"
                    onClick={() => setFilterByCarriers([])}
                    className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 p-0.5"
                  >
                    ×
                  </button>
                </span>
              )}
              {filterBySteps.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2.5 py-0.5 text-emerald-800 dark:text-emerald-200">
                  Steps: {filterBySteps.join(', ')}
                  <button
                    type="button"
                    aria-label="Clear step filter"
                    onClick={() => setFilterBySteps([])}
                    className="rounded-full hover:bg-emerald-200 dark:hover:bg-emerald-800 p-0.5"
                  >
                    ×
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => { setFilterByCarriers([]); setFilterBySteps([]); }}
                className="text-slate-500 dark:text-slate-400 underline hover:text-slate-700 dark:hover:text-slate-200"
              >
                Clear all
              </button>
            </>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 text-sm">No filters applied</span>
          )}
        </div>

        {error && (
          <div className="mb-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200 text-sm shrink-0">
            {error}
            <p className="mt-2 text-red-600 dark:text-red-300">
              Place your report at <code className="bg-red-100 dark:bg-red-900/50 px-1 rounded">public/data/report.xlsx</code> or use
              “Choose Excel file” to pick it from your <code className="bg-red-100 dark:bg-red-900/50 px-1 rounded">data</code> folder.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div
            ref={dashboardRef}
            className="flex-1 min-h-0 relative w-full"
            style={{ minHeight: 200 }}
          >
            <ResizablePanel
              id="carrier"
              rect={panelLayout.carrier}
              title="Deliveries per carrier"
              onMove={(dx, dy) => handlePanelMove('carrier', dx, dy)}
              onResize={(edge, dx, dy) => handlePanelResize('carrier', edge, dx, dy)}
              className="p-4"
            >
              <div
                className="h-full flex flex-col min-h-0 overflow-hidden"
                onClick={inCarrierSelectionMode ? confirmCarrierSelection : undefined}
              >
                {inCarrierSelectionMode && (
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 shadow-sm mb-2 shrink-0">
                    <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Confirm or cancel:</span>
                    <button
                      type="button"
                      aria-label="Cancel selection"
                      onClick={(e) => { e.stopPropagation(); cancelCarrierSelection(); }}
                      className="rounded p-1.5 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300"
                      title="Cancel selection"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Confirm selection"
                      onClick={(e) => { e.stopPropagation(); confirmCarrierSelection(); }}
                      disabled={pendingCarriers.size === 0}
                      className="rounded p-1.5 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 disabled:pointer-events-none"
                      title="Confirm selection"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </button>
                  </div>
                )}
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 shrink-0">
                  Total deliveries: <strong>{totalDeliveries.toLocaleString()}</strong>
                  {totalLines !== totalDeliveries && (
                    <span className="text-slate-400 dark:text-slate-500 ml-2">
                      ({totalLines.toLocaleString()} lines)
                    </span>
                  )}
                  {filterBySteps.length > 0 && (
                    <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5">
                      Showing for steps: {filterBySteps.join(', ')}
                    </span>
                  )}
                  {inCarrierSelectionMode && (
                    <span className="block text-blue-600 dark:text-blue-400 mt-0.5">
                      {pendingCarriers.size > 0
                        ? `Selected: ${Array.from(pendingCarriers).join(', ')} — click more carriers or ✓ to filter step chart, X to cancel`
                        : 'Click one or more carriers, then ✓ to filter step chart'}
                    </span>
                  )}
                </p>
                <div
                  className="flex-1 min-h-0 overflow-auto space-y-3"
                  style={{ minHeight: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {carrierBarsToShow.map(({ carrier, count }) => (
                    <button
                      type="button"
                      key={carrier}
                      onClick={() => toggleCarrierPending(carrier)}
                      className={`w-full flex items-center gap-4 text-left rounded-lg p-1 -m-1 transition-colors ${
                        pendingCarriers.has(carrier) ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800 bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="w-32 shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {carrier}
                      </div>
                      <div className="flex-1 flex items-center gap-3">
                        <div className="flex-1 h-8 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded min-w-[2px] transition-all duration-300"
                            style={{ width: `${(count / maxCarrierDisplay) * 100}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300 font-medium">
                          {count.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 shrink-0">
                  {inCarrierSelectionMode
                    ? 'Click carriers to add/remove from selection, ✓ to confirm filter, or X to cancel'
                    : 'Click a carrier to enter selection mode; select one or more, then confirm to filter the step chart'}
                </p>
              </div>
            </ResizablePanel>

            <ResizablePanel
              id="step"
              rect={panelLayout.step}
              title="Lines per step status"
              onMove={(dx, dy) => handlePanelMove('step', dx, dy)}
              onResize={(edge, dx, dy) => handlePanelResize('step', edge, dx, dy)}
              className="p-4"
            >
              <div
                className="h-full flex flex-col min-h-0 overflow-hidden"
                onClick={inStepSelectionMode ? confirmStepSelection : undefined}
              >
              {inStepSelectionMode && (
                <div className="absolute top-4 right-4 flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2 py-1 shadow-sm">
                  <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Confirm or cancel:</span>
                  <button
                    type="button"
                    aria-label="Cancel selection"
                    onClick={(e) => { e.stopPropagation(); cancelStepSelection(); }}
                    className="rounded p-1.5 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300"
                    title="Cancel selection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Confirm selection"
                    onClick={(e) => { e.stopPropagation(); confirmStepSelection(); }}
                    disabled={pendingSteps.size === 0}
                    className="rounded p-1.5 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 disabled:pointer-events-none"
                    title="Confirm selection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                </div>
                )}
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 shrink-0">
                  Total lines: <strong>{totalLines.toLocaleString()}</strong>
                {filterByCarriers.length > 0 && (
                  <span className="block text-blue-600 dark:text-blue-400 mt-0.5">
                    Showing for carriers: {filterByCarriers.join(', ')}
                  </span>
                )}
                {inStepSelectionMode && (
                  <span className="block text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {pendingSteps.size > 0
                      ? `Selected: ${Array.from(pendingSteps).join(', ')} — click more steps or ✓ to filter carrier chart, X to cancel`
                      : 'Click one or more steps, then ✓ to filter carrier chart'}
                  </span>
                )}
              </p>
              {stepKey ? (
                <div
                  className="flex-1 min-h-0 overflow-auto space-y-3"
                  style={{ minHeight: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {stepBarsToShow.map(({ step, count }) => (
                    <button
                      type="button"
                      key={step}
                      onClick={() => toggleStepPending(step)}
                      className={`w-full flex items-center gap-4 text-left rounded-lg p-1 -m-1 transition-colors ${
                        pendingSteps.has(step) ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-800 bg-emerald-50 dark:bg-emerald-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="w-36 shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {step}
                      </div>
                      <div className="flex-1 flex items-center gap-3">
                        <div className="flex-1 h-8 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded min-w-[2px] transition-all duration-300"
                            style={{ width: `${(count / maxStepDisplay) * 100}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300 font-medium">
                          {count.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400 text-sm">No “Next Outbound Step” column found in this report.</p>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 shrink-0">
                {inStepSelectionMode
                  ? 'Click steps to add/remove from selection, ✓ to confirm filter, or X to cancel'
                  : 'Click a step to enter selection mode; select one or more, then confirm to filter the carrier chart'}
                </p>
              </div>
            </ResizablePanel>

            {deliveryIdKey && (
              <ResizablePanel
                id="table"
                rect={panelLayout.table}
                title="Deliveries summary"
                onMove={(dx, dy) => handlePanelMove('table', dx, dy)}
                onResize={(edge, dx, dy) => handlePanelResize('table', edge, dx, dy)}
                className="p-4"
              >
                <div className="h-full flex flex-col min-h-0 overflow-hidden">
            <p className="text-sm text-slate-500 dark:text-slate-400 px-4 mb-2 shrink-0">
              <strong>{deliveriesInTableCount.toLocaleString()}</strong> delivery{deliveriesInTableCount !== 1 ? 's' : ''}. One row per delivery. Metrics will be calculated when formulas are added.
              {filterByCarriers.length > 0 && (
                <span className="block text-blue-600 dark:text-blue-400 mt-0.5">
                  Showing deliveries for carriers: {filterByCarriers.join(', ')}
                </span>
              )}
              {(Object.keys(tableColumnFilters).length > 0) && (
                <button
                  type="button"
                  onClick={() => setTableColumnFilters({})}
                  className="block mt-1 text-slate-500 dark:text-slate-400 underline hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Clear all table filters
                </button>
              )}
            </p>
            <div className="flex-1 min-h-0 overflow-auto border-t border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700/80 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
                  <tr className="border-b border-slate-200 dark:border-slate-600">
                    {TABLE_COLUMNS.map(({ key, label, align }) => (
                      <th
                        key={key}
                        className={`font-semibold text-slate-700 dark:text-slate-200 px-4 py-3 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleTableSort(key)}
                          className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-slate-800 rounded ${align === 'right' ? 'justify-end w-full' : ''} ${tableSort?.key === key ? 'text-blue-600 dark:text-blue-400' : ''}`}
                        >
                          {label}
                          {tableSort?.key === key && (
                            <span className="text-blue-600 dark:text-blue-400" aria-hidden>
                              {tableSort?.dir === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-200 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-700/50">
                    {TABLE_COLUMNS.map(({ key, align }) => (
                      <th key={key} className={`px-4 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
                        <div ref={tableFilterPopup === key ? filterPopupRef : undefined} className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setTableFilterPopup((prev) => (prev === key ? null : key))}
                            className={`inline-flex items-center gap-1 px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${tableFilterPopup === key ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-slate-300 dark:border-slate-600'}`}
                            aria-label={`Filter by ${TABLE_COLUMNS.find((c) => c.key === key)?.label ?? key}`}
                            aria-expanded={tableFilterPopup === key}
                          >
                            Filter
                            {tableColumnFilters[key] !== undefined && (
                              <span className="text-blue-600 dark:text-blue-400 font-medium" aria-hidden>
                                ({tableColumnFilters[key]?.size ?? 0})
                              </span>
                            )}
                          </button>
                          {tableFilterPopup === key && (() => {
                            const distinct = [...new Set(unfilteredTableRows.map((r) => getCellValue(r, key, formatDurationMs)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                            const allowed = tableColumnFilters[key];
                            const toggleValue = (v: string) => {
                              setTableColumnFilters((prev) => {
                                const next = { ...prev };
                                const current = next[key] ?? new Set(distinct);
                                const nextSet = new Set(current);
                                if (nextSet.has(v)) nextSet.delete(v);
                                else nextSet.add(v);
                                if (nextSet.size === 0) next[key] = new Set();
                                else if (nextSet.size === distinct.length) {
                                  delete next[key];
                                } else {
                                  next[key] = nextSet;
                                }
                                return next;
                              });
                            };
                            const selectAll = () => {
                              setTableColumnFilters((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            };
                            const clearAll = () => {
                              setTableColumnFilters((prev) => ({ ...prev, [key]: new Set() }));
                            };
                            return (
                              <div
                                className="absolute left-0 top-full mt-1 z-20 min-w-[200px] max-h-[280px] overflow-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-2"
                                role="dialog"
                                aria-label={`Filter values for ${TABLE_COLUMNS.find((c) => c.key === key)?.label}`}
                              >
                                <div className="flex gap-1 px-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                                  <button
                                    type="button"
                                    onClick={selectAll}
                                    className="flex-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded"
                                  >
                                    Select all
                                  </button>
                                  <button
                                    type="button"
                                    onClick={clearAll}
                                    className="flex-1 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                                  >
                                    Clear all
                                  </button>
                                </div>
                                <div className="py-1 max-h-[220px] overflow-auto">
                                  {distinct.map((value) => (
                                    <label
                                      key={value}
                                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={allowed === undefined ? true : allowed.has(value)}
                                        onChange={() => toggleValue(value)}
                                        className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                                      />
                                      <span className="truncate" title={value}>
                                        {value || '(blank)'}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let filtered: TableRow[] = unfilteredTableRows.filter((row) => {
                      for (const { key } of TABLE_COLUMNS) {
                        const allowed = tableColumnFilters[key];
                        if (allowed !== undefined) {
                          if (allowed.size === 0) return false;
                          const v = getCellValue(row, key, formatDurationMs);
                          if (!allowed.has(v)) return false;
                        }
                      }
                      return true;
                    });
                    const sortKey = tableSort?.key ?? 'delivery';
                    const dir = tableSort?.dir ?? 'asc';
                    const mult = dir === 'asc' ? 1 : -1;
                    filtered = [...filtered].sort((a, b) => {
                      let cmp = 0;
                      switch (sortKey) {
                        case 'delivery':
                          cmp = a.deliveryId.localeCompare(b.deliveryId, undefined, { numeric: true });
                          break;
                        case 'parcels':
                          cmp = a.parcels - b.parcels;
                          break;
                        case 'pallets':
                          cmp = a.pallets - b.pallets;
                          break;
                        case 'dispatchToPicking': {
                          const va = a.dispatchToPickingMs ?? -1;
                          const vb = b.dispatchToPickingMs ?? -1;
                          cmp = va - vb;
                          break;
                        }
                        case 'pickingToPacking':
                        case 'packingToFirmContents':
                          cmp = 0;
                          break;
                        default:
                          cmp = a.deliveryId.localeCompare(b.deliveryId, undefined, { numeric: true });
                      }
                      return cmp * mult;
                    });
                    return filtered.map((row) => (
                      <tr
                        key={row.deliveryId}
                        className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                          {row.deliveryId}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          {containerTypeKey && outermostLpnKey
                            ? row.parcels.toLocaleString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          {containerTypeKey && outermostLpnKey
                            ? row.pallets.toLocaleString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          {dispatchedTimestampKey
                            ? (row.dispatchToPickingMs != null ? formatDurationMs(row.dispatchToPickingMs) : '—')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          —
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          —
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
                </div>
              </ResizablePanel>
            )}
          </div>
        )}
        {!loading && rows.length === 0 && !error && (
          <p className="text-slate-500 dark:text-slate-400 text-center py-12">
            Load a report to see deliveries per carrier and lines per step.
          </p>
        )}
      </main>
    </div>
  );
}

export default App;
