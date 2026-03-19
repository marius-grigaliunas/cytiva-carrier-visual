import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  loadReportFromUrl,
  deliveriesByCarrier,
  uniqueDeliveryCount,
  linesByStep,
  type ReportRow,
} from './utils/loadReport';
import { countParcelsForDelivery, countPalletsForDelivery, maxDispatchToPickingMsForDelivery } from './utils/tableHeaderFormulas';
import { getCarrierOrder, getCarrierFromShipMethod } from './utils/carriers.ts';
import * as XLSX from 'xlsx';

import type { TruckScheduleItem } from './types/schedule';
import { TruckScheduleStrip, type AddTruckData } from './components/TruckScheduleStrip';
import { TRUCK_SCHEDULE, getDefaultCutoffsByCarrier } from './utils/truckSchedule';
import { CarrierGrid } from './components/CarrierGrid';
import { AlertPanel } from './components/AlertPanel';
import { DeliveriesPerCarrier } from './components/DeliveriesPerCarrier';
import { LinesPerStep } from './components/LinesPerStep';
import { DeliveriesSummary, type TableRow, type TableColumnKey } from './components/DeliveriesSummary';
import { computeCarrierStats } from './utils/carrierStats';
import { computeAlerts } from './utils/alerts';

import cytivaLogo from './assets/Cytiva.svg';
import { ResizablePanel, clampRectToBounds, clampRectNoOverlap, type PanelRect } from './ResizablePanel';

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
const DEFAULT_REPORT_URL = `${base}data/report.xlsx`

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
  const panelVisibleRef = useRef<Record<string, boolean>>({});
  const previousBurnRateRef = useRef<Record<string, number>>({});

  const getInitialTrucks = useCallback((): TruckScheduleItem[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return TRUCK_SCHEDULE.map((t, i) => {
      const [h, m] = t.time.trim().split(':').map((s) => parseInt(s, 10) || 0);
      const d = new Date(today);
      d.setHours(h, m, 0, 0);
      return {
        id: `truck-${i + 1}-${t.carrier}`,
        label: t.name,
        departureMs: d.getTime(),
        carrier: t.carrier,
        cancelled: false,
      };
    });
  }, []);

  const [trucks, setTrucks] = useState<TruckScheduleItem[]>(getInitialTrucks);
  const defaultCutoffs = useMemo(getDefaultCutoffsByCarrier, []);
  const [cutoffsByCarrier, setCutoffsByCarrier] = useState<Record<string, number>>(() => ({ ...defaultCutoffs }));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((k) => k + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const getInitialPanelLayout = useCallback((): Record<string, PanelRect> => ({
    carrier: { x: 0, y: 0, w: 50, h: 28 },
    step: { x: 50, y: 0, w: 50, h: 28 },
    truckSchedule: { x: 0, y: 28, w: 100, h: 14 },
    carrierGrid: { x: 0, y: 42, w: 65, h: 28 },
    alertPanel: { x: 65, y: 42, w: 35, h: 28 },
    table: { x: 0, y: 70, w: 100, h: 30 },
  }), []);

  type PanelType = 'carrier' | 'step' | 'table' | 'truckSchedule' | 'carrierGrid' | 'alertPanel';
  const [panelOrder, setPanelOrder] = useState<string[]>(['carrier', 'step', 'table', 'truckSchedule', 'carrierGrid', 'alertPanel']);
  const [panelVisible, setPanelVisible] = useState<Record<string, boolean>>({
    carrier: true, step: true, table: true,
    truckSchedule: true, carrierGrid: true, alertPanel: true,
  });
  const [panelTypes, setPanelTypes] = useState<Record<string, PanelType>>({
    carrier: 'carrier', step: 'step', table: 'table',
    truckSchedule: 'truckSchedule', carrierGrid: 'carrierGrid', alertPanel: 'alertPanel',
  });
  const [panelLayout, setPanelLayout] = useState<Record<string, PanelRect>>(getInitialPanelLayout);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => { panelVisibleRef.current = panelVisible; }, [panelVisible]);

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

  const nowMs = Date.now();
  const cutoffMs =
    trucks.filter((t) => !t.cancelled).length > 0
      ? Math.min(...trucks.filter((t) => !t.cancelled).map((t) => t.departureMs))
      : null;

  const carrierStats = useMemo(() => {
    if (!shipMethodKey || !containerTypeKey || !outermostLpnKey) return [];
    return computeCarrierStats({
      rows,
      shipMethodKey,
      containerTypeKey,
      outermostLpnKey,
      dispatchedTimestampKey,
      dropOffTimestampKey,
      cutoffMs,
      nowMs,
    });
  }, [
    rows,
    shipMethodKey,
    containerTypeKey,
    outermostLpnKey,
    dispatchedTimestampKey,
    dropOffTimestampKey,
    cutoffMs,
    nowMs,
    tick,
  ]);

  const alerts = useMemo(() => {
    return computeAlerts({
      rows,
      shipMethodKey,
      stepKey,
      trucks,
      carrierStats,
    previousBurnRateByCarrier: previousBurnRateRef.current,
    nowMs,
  });
  }, [rows, shipMethodKey, stepKey, trucks, carrierStats, nowMs, tick]);

  useEffect(() => {
    carrierStats.forEach((s) => {
      previousBurnRateRef.current[s.carrier] = s.burnRatePalletsPerHour;
    });
  }, [carrierStats]);

  const handleCutoffChange = useCallback((carrier: string, ms: number) => {
    setCutoffsByCarrier((prev) => ({ ...prev, [carrier]: ms }));
  }, []);

  const handleAddTruck = useCallback((truck: AddTruckData) => {
    const [h, m] = truck.time.trim().split(':').map((s) => parseInt(s, 10) || 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    setTrucks((prev) => [
      ...prev,
      {
        id: `truck-${Date.now()}-${truck.carrier}`,
        label: truck.name || 'Truck',
        departureMs: d.getTime(),
        carrier: truck.carrier,
        cancelled: false,
      },
    ]);
  }, []);

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
      setPanelOrder(['carrier', 'step', 'table', 'truckSchedule', 'carrierGrid', 'alertPanel']);
      setPanelVisible({ carrier: true, step: false, table: false, truckSchedule: true, carrierGrid: true, alertPanel: false });
      setPanelTypes({ carrier: 'carrier', step: 'step', table: 'table', truckSchedule: 'truckSchedule', carrierGrid: 'carrierGrid', alertPanel: 'alertPanel' });
      setTrucks(getInitialTrucks());
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
          setPanelOrder(['carrier', 'step', 'table', 'truckSchedule', 'carrierGrid', 'alertPanel']);
setPanelVisible({ carrier: true, step: false, table: false, truckSchedule: true, carrierGrid: true, alertPanel: false });
        setPanelTypes({ carrier: 'carrier', step: 'step', table: 'table', truckSchedule: 'truckSchedule', carrierGrid: 'carrierGrid', alertPanel: 'alertPanel' });
        setTrucks(getInitialTrucks());
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
          .filter((k) => k !== id && panelVisibleRef.current[k] !== false && (k !== 'table' || deliveryIdKey))
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
          .filter((k) => k !== id && panelVisibleRef.current[k] !== false && (k !== 'table' || deliveryIdKey))
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

  const minimizePanel = useCallback((id: string) => {
    setPanelVisible((prev) => ({ ...prev, [id]: false }));
  }, []);

  const restorePanel = useCallback((id: string) => {
    setPanelVisible((prev) => ({ ...prev, [id]: true }));
  }, []);

  const getPanelTitle = useCallback((id: string, type: PanelType) => {
    switch (type) {
      case 'carrier':
        return `Deliveries per carrier (Total: ${totalDeliveries.toLocaleString()})`;
      case 'step':
        return `Lines per step status (Total: ${totalLines.toLocaleString()})`;
      case 'table':
        return `Deliveries summary (${deliveriesInTableCount.toLocaleString()} delivery${deliveriesInTableCount !== 1 ? 's' : ''})`;
      case 'truckSchedule':
        return 'Truck schedule';
      case 'carrierGrid':
        return 'Carrier grid';
      case 'alertPanel':
        return 'Alerts';
      default:
        return id;
    }
  }, [totalDeliveries, totalLines, deliveriesInTableCount]);

  const addPanel = useCallback((type: PanelType) => {
    const existingOfType = panelOrder.filter((i) => panelTypes[i] === type);
    const newId = existingOfType.length === 0 ? type : `${type}-${existingOfType.length + 1}`;
    const defaultRect: PanelRect = { x: 10, y: 10, w: 45, h: 45 };
    setPanelOrder((prev) => [...prev, newId]);
    setPanelLayout((prev) => ({ ...prev, [newId]: defaultRect }));
    setPanelVisible((prev) => ({ ...prev, [newId]: true }));
    setPanelTypes((prev) => ({ ...prev, [newId]: type }));
  }, [panelOrder, panelTypes]);

  const visiblePanelIds = panelOrder.filter(
    (id) => panelVisible[id] !== false && (panelTypes[id] !== 'table' || deliveryIdKey)
  );
  const minimizedPanelIds = panelOrder.filter(
    (id) => !panelVisible[id] && (panelTypes[id] !== 'table' || deliveryIdKey)
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
      <main className="flex-1 min-h-0 flex flex-col p-2 md:p-3 w-full overflow-hidden">
        <div className="mb-1 min-h-0 flex items-center gap-1.5 text-xs rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 shrink-0">
          {hasFilter ? (
            <>
              <span className="text-slate-600 dark:text-slate-300">Filter:</span>
              {filterByCarriers.length > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 text-blue-800 dark:text-blue-200">
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
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 text-emerald-800 dark:text-emerald-200">
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
            <span className="text-slate-400 dark:text-slate-500">No filters applied</span>
          )}
        </div>

        {error && (
          <div className="mb-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-800 dark:text-red-200 text-xs shrink-0">
            {error}
            <p className="mt-1 text-red-600 dark:text-red-300 text-xs">
              Place your report at <code className="bg-red-100 dark:bg-red-900/50 px-1 rounded">public/data/report.xlsx</code> or use
              “Choose Excel file” to pick it from your <code className="bg-red-100 dark:bg-red-900/50 px-1 rounded">data</code> folder.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-1 min-h-0 min-w-0">
            {/* Sidebar: minimized panels + add panel */}
            <aside
              className={`shrink-0 flex flex-col bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-[width] duration-200 overflow-hidden ${
                sidebarOpen ? 'w-56' : 'w-0'
              }`}
            >
              <div className="flex items-center justify-between px-2 py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Panels</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen((o) => !o)}
                  className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600"
                  aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                  <svg className={`w-4 h-4 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                </button>
              </div>
              {sidebarOpen && (
                <div className="flex flex-col gap-1 p-2 overflow-auto">
                  {/* Default cutoff times (per carrier) */}
                  <div className="mb-2 pb-2 border-b border-slate-200 dark:border-slate-600">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Default cutoff times
                    </div>
                    <div className="flex flex-col gap-1">
                      {getCarrierOrder().map((carrier) => {
                        const ms = cutoffsByCarrier[carrier] ?? defaultCutoffs[carrier];
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const timeStr = ms != null
                          ? `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`
                          : '';
                        return (
                          <div key={carrier} className="flex items-center justify-between gap-1">
                            <span className="text-xs text-slate-700 dark:text-slate-300 truncate min-w-0">
                              {carrier}
                            </span>
                            <input
                              type="time"
                              value={timeStr}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v) {
                                  const [h = 0, m = 0] = v.split(':').map((s) => parseInt(s, 10) || 0);
                                  const d = new Date(today);
                                  d.setHours(h, m, 0, 0);
                                  handleCutoffChange(carrier, d.getTime());
                                }
                              }}
                              className="text-xs w-20 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shrink-0"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {minimizedPanelIds.length > 0 ? (
                    <>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Not on dashboard</div>
                      {minimizedPanelIds.map((id) => {
                        const type = panelTypes[id];
                        const labels: Record<PanelType, string> = {
                          carrier: 'Deliveries per carrier',
                          step: 'Lines per step',
                          table: 'Deliveries summary',
                          truckSchedule: 'Truck schedule',
                          carrierGrid: 'Carrier grid',
                          alertPanel: 'Alerts',
                        };
                        const label = labels[type] ?? id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => restorePanel(id)}
                            className="text-left px-3 py-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm text-slate-800 dark:text-slate-100 transition-colors"
                          >
                            <span className="font-medium">{label}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click to show on dashboard</span>
                          </button>
                        );
                      })}
                    </>
                  ) : null}
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                  </div>
                </div>
              )}
            </aside>
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="shrink-0 self-start mt-2 ml-1 p-1.5 rounded-r bg-slate-100 dark:bg-slate-800 border border-l-0 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                aria-label="Open panels sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 12h14" /></svg>
              </button>
            )}
          <div
            ref={dashboardRef}
            className="flex-1 min-h-0 relative w-full min-w-0"
            style={{ minHeight: 200 }}
          >
            {visiblePanelIds.map((id) => {
              const type = panelTypes[id];
              const rect = panelLayout[id];
              if (!rect) return null;
              return (
            <ResizablePanel
              key={id}
              id={id}
              rect={rect}
              title={getPanelTitle(id, type)}
              onMove={(dx, dy) => handlePanelMove(id, dx, dy)}
              onResize={(edge, dx, dy) => handlePanelResize(id, edge, dx, dy)}
              onMinimize={() => minimizePanel(id)}
              className="p-2"
            >
              {type === 'carrier' && (
                <DeliveriesPerCarrier
                  bars={carrierBarsToShow}
                  maxCount={maxCarrierDisplay}
                  pendingCarriers={pendingCarriers}
                  inSelectionMode={inCarrierSelectionMode}
                  filterBySteps={filterBySteps}
                  onToggleCarrier={toggleCarrierPending}
                  onConfirmSelection={confirmCarrierSelection}
                  onCancelSelection={cancelCarrierSelection}
                />
              )}
              {type === 'step' && (
                <LinesPerStep
                  bars={stepBarsToShow}
                  maxCount={maxStepDisplay}
                  pendingSteps={pendingSteps}
                  inSelectionMode={inStepSelectionMode}
                  filterByCarriers={filterByCarriers}
                  stepKey={stepKey}
                  onToggleStep={toggleStepPending}
                  onConfirmSelection={confirmStepSelection}
                  onCancelSelection={cancelStepSelection}
                />
              )}
              {type === 'truckSchedule' && (
                <div className="h-full min-h-0 overflow-auto flex flex-col">
                  <TruckScheduleStrip
                    trucks={trucks}
                    onTrucksChange={setTrucks}
                    onAddTruck={handleAddTruck}
                    className="flex-1 min-h-0"
                  />
                </div>
              )}
              {type === 'carrierGrid' && (
                <div className="h-full min-h-0 overflow-auto">
                  <CarrierGrid
                    stats={carrierStats}
                    trucks={trucks}
                    cutoffsByCarrier={cutoffsByCarrier}
                    className="h-full"
                  />
                </div>
              )}
              {type === 'alertPanel' && (
                <div className="h-full min-h-0 flex flex-col">
                  <AlertPanel alerts={alerts} className="flex-1 min-h-0" />
                </div>
              )}
              {type === 'table' && (
                <DeliveriesSummary
                  rows={unfilteredTableRows}
                  columnFilters={tableColumnFilters}
                  onColumnFiltersChange={setTableColumnFilters}
                  filterPopup={tableFilterPopup}
                  onFilterPopupChange={setTableFilterPopup}
                  filterPopupRef={filterPopupRef}
                  sort={tableSort}
                  onSort={handleTableSort}
                  filterByCarriers={filterByCarriers}
                  containerTypeKey={containerTypeKey}
                  outermostLpnKey={outermostLpnKey}
                  dispatchedTimestampKey={dispatchedTimestampKey}
                />
              )}
            </ResizablePanel>
              );
            })}
          </div>
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
