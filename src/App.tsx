import { useState, useCallback } from 'react';
import {
  loadReportFromUrl,
  deliveriesByCarrier,
  uniqueDeliveryCount,
  linesByStep,
  type ReportRow,
} from './utils/loadReport';
import { getCarrierOrder, getCarrierFromShipMethod } from './utils/carriers.ts';
import * as XLSX from 'xlsx';

import cytivaLogo from './assets/Cytiva.svg';

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
const DEFAULT_REPORT_URL = `${base}data/report.xlsx`

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [shipMethodKey, setShipMethodKey] = useState('');
  const [deliveryIdKey, setDeliveryIdKey] = useState('');
  const [stepKey, setStepKey] = useState('');
  const [filterByCarriers, setFilterByCarriers] = useState<string[]>([]);
  const [filterBySteps, setFilterBySteps] = useState<string[]>([]);
  const [pendingCarriers, setPendingCarriers] = useState<Set<string>>(new Set());
  const [pendingSteps, setPendingSteps] = useState<Set<string>>(new Set());

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

  const carrierBarAreaMinHeight = byCarrier.length * 48;
  const stepBarAreaMinHeight = byStep.length * 48;

  const loadFromUrl = useCallback(async () => {
    setError(null);
    setLoading(true);
    setFilterByCarriers([]);
    setFilterBySteps([]);
    setPendingCarriers(new Set());
    setPendingSteps(new Set());
    try {
      const { rows: data, shipMethodKey: key, deliveryIdKey: didKey, stepKey: sk } =
        await loadReportFromUrl(DEFAULT_REPORT_URL);
      setRows(data);
      setShipMethodKey(key);
      setDeliveryIdKey(didKey);
      setStepKey(sk);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
      setRows([]);
      setShipMethodKey('');
      setDeliveryIdKey('');
      setStepKey('');
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
              const deliveryFirst = headers.findIndex((header) =>
                /delivery/.test(lower(header))
              );
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
          setRows(data);
          setShipMethodKey(shipMethodKey);
          setDeliveryIdKey(deliveryIdKey);
          setStepKey(stepKey);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse file');
          setRows([]);
          setShipMethodKey('');
          setDeliveryIdKey('');
          setStepKey('');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    },
    []
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex items-center gap-4 px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
        <img src={cytivaLogo} alt="Cytiva logo" className="h-8 w-auto" />
        <h1 className="text-xl font-semibold text-slate-800 w-full text-left">
          Carrier dashboard
        </h1>
        <h2 className="text-md font-semibold text-slate-700 w-full text-right">
          Created by: <span className="font-bold">Marius Grigaliunas</span>
        </h2>
      </header>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="flex flex-wrap gap-3 items-center mb-6">
          <button
            type="button"
            onClick={loadFromUrl}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Loading…' : 'Load report from server'}
          </button>
          <label className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg font-medium hover:bg-slate-300 cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={loadFromFile}
              disabled={loading}
            />
            Choose Excel file…
          </label>
          {shipMethodKey && (
            <span className="text-sm text-slate-500">
              Ship method: <strong>{shipMethodKey}</strong>
              {deliveryIdKey && (
                <> · Delivery ID: <strong>{deliveryIdKey}</strong></>
              )}
              {stepKey && (
                <> · Step: <strong>{stepKey}</strong></>
              )}
            </span>
          )}
        </div>

        <div className="mb-4 min-h-10 flex items-center gap-2 text-sm rounded-lg bg-slate-100 px-3">
          {hasFilter ? (
            <>
              <span className="text-slate-600">Filter:</span>
              {filterByCarriers.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-blue-800">
                  Carriers: {filterByCarriers.join(', ')}
                  <button
                    type="button"
                    aria-label="Clear carrier filter"
                    onClick={() => setFilterByCarriers([])}
                    className="rounded-full hover:bg-blue-200 p-0.5"
                  >
                    ×
                  </button>
                </span>
              )}
              {filterBySteps.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">
                  Steps: {filterBySteps.join(', ')}
                  <button
                    type="button"
                    aria-label="Clear step filter"
                    onClick={() => setFilterBySteps([])}
                    className="rounded-full hover:bg-emerald-200 p-0.5"
                  >
                    ×
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => { setFilterByCarriers([]); setFilterBySteps([]); }}
                className="text-slate-500 underline hover:text-slate-700"
              >
                Clear all
              </button>
            </>
          ) : (
            <span className="text-slate-400 text-sm">No filters applied</span>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {error}
            <p className="mt-2 text-red-600">
              Place your report at <code className="bg-red-100 px-1 rounded">public/data/report.xlsx</code> or use
              “Choose Excel file” to pick it from your <code className="bg-red-100 px-1 rounded">data</code> folder.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative"
              onClick={inCarrierSelectionMode ? confirmCarrierSelection : undefined}
            >
              {inCarrierSelectionMode && (
                <div className="absolute top-4 right-4 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 shadow-sm">
                  <span className="text-xs text-slate-500 mr-1">Confirm or cancel:</span>
                  <button
                    type="button"
                    aria-label="Cancel selection"
                    onClick={(e) => { e.stopPropagation(); cancelCarrierSelection(); }}
                    className="rounded p-1.5 text-slate-600 hover:bg-red-100 hover:text-red-700"
                    title="Cancel selection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Confirm selection"
                    onClick={(e) => { e.stopPropagation(); confirmCarrierSelection(); }}
                    disabled={pendingCarriers.size === 0}
                    className="rounded p-1.5 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 disabled:opacity-50 disabled:pointer-events-none"
                    title="Confirm selection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                </div>
              )}
              <h2 className="text-lg font-semibold text-slate-800 mb-1">
                Deliveries per carrier
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Total deliveries: <strong>{totalDeliveries.toLocaleString()}</strong>
                {totalLines !== totalDeliveries && (
                  <span className="text-slate-400 ml-2">
                    ({totalLines.toLocaleString()} lines)
                  </span>
                )}
                {filterBySteps.length > 0 && (
                  <span className="block text-emerald-600 mt-0.5">
                    Showing for steps: {filterBySteps.join(', ')}
                  </span>
                )}
                {inCarrierSelectionMode && (
                  <span className="block text-blue-600 mt-0.5">
                    {pendingCarriers.size > 0
                      ? `Selected: ${Array.from(pendingCarriers).join(', ')} — click more carriers or ✓ to filter step chart, X to cancel`
                      : 'Click one or more carriers, then ✓ to filter step chart'}
                  </span>
                )}
              </p>
              <div
                className="space-y-4"
                style={{ minHeight: carrierBarAreaMinHeight }}
                onClick={(e) => e.stopPropagation()}
              >
                {carrierBarsToShow.map(({ carrier, count }) => (
                  <button
                    type="button"
                    key={carrier}
                    onClick={() => toggleCarrierPending(carrier)}
                    className={`w-full flex items-center gap-4 text-left rounded-lg p-1 -m-1 transition-colors ${
                      pendingCarriers.has(carrier) ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-32 shrink-0 text-sm font-medium text-slate-700">
                      {carrier}
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 h-8 bg-slate-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded min-w-[2px] transition-all duration-300"
                          style={{ width: `${(count / maxCarrierDisplay) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-sm tabular-nums text-slate-600 font-medium">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">
                {inCarrierSelectionMode
                  ? 'Click carriers to add/remove from selection, ✓ to confirm filter, or X to cancel'
                  : 'Click a carrier to enter selection mode; select one or more, then confirm to filter the step chart'}
              </p>
            </section>

            <section
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative"
              onClick={inStepSelectionMode ? confirmStepSelection : undefined}
            >
              {inStepSelectionMode && (
                <div className="absolute top-4 right-4 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 shadow-sm">
                  <span className="text-xs text-slate-500 mr-1">Confirm or cancel:</span>
                  <button
                    type="button"
                    aria-label="Cancel selection"
                    onClick={(e) => { e.stopPropagation(); cancelStepSelection(); }}
                    className="rounded p-1.5 text-slate-600 hover:bg-red-100 hover:text-red-700"
                    title="Cancel selection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Confirm selection"
                    onClick={(e) => { e.stopPropagation(); confirmStepSelection(); }}
                    disabled={pendingSteps.size === 0}
                    className="rounded p-1.5 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 disabled:opacity-50 disabled:pointer-events-none"
                    title="Confirm selection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                </div>
              )}
              <h2 className="text-lg font-semibold text-slate-800 mb-1">
                Lines per step status
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Total lines: <strong>{totalLines.toLocaleString()}</strong>
                {filterByCarriers.length > 0 && (
                  <span className="block text-blue-600 mt-0.5">
                    Showing for carriers: {filterByCarriers.join(', ')}
                  </span>
                )}
                {inStepSelectionMode && (
                  <span className="block text-emerald-600 mt-0.5">
                    {pendingSteps.size > 0
                      ? `Selected: ${Array.from(pendingSteps).join(', ')} — click more steps or ✓ to filter carrier chart, X to cancel`
                      : 'Click one or more steps, then ✓ to filter carrier chart'}
                  </span>
                )}
              </p>
              {stepKey ? (
                <div
                  className="space-y-4"
                  style={{ minHeight: stepBarAreaMinHeight }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {stepBarsToShow.map(({ step, count }) => (
                    <button
                      type="button"
                      key={step}
                      onClick={() => toggleStepPending(step)}
                      className={`w-full flex items-center gap-4 text-left rounded-lg p-1 -m-1 transition-colors ${
                        pendingSteps.has(step) ? 'ring-2 ring-emerald-500 ring-offset-2 bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-36 shrink-0 text-sm font-medium text-slate-700">
                        {step}
                      </div>
                      <div className="flex-1 flex items-center gap-3">
                        <div className="flex-1 h-8 bg-slate-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded min-w-[2px] transition-all duration-300"
                            style={{ width: `${(count / maxStepDisplay) * 100}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-sm tabular-nums text-slate-600 font-medium">
                          {count.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No “Next Outbound Step” column found in this report.</p>
              )}
              <p className="text-xs text-slate-400 mt-3">
                {inStepSelectionMode
                  ? 'Click steps to add/remove from selection, ✓ to confirm filter, or X to cancel'
                  : 'Click a step to enter selection mode; select one or more, then confirm to filter the carrier chart'}
              </p>
            </section>
          </div>
        )}

        {rows.length > 0 && deliveryIdKey && (
          <section className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold text-slate-800 p-6 pb-2">
              Deliveries summary
            </h2>
            <p className="text-sm text-slate-500 px-6 mb-4">
              <strong>{deliveriesInTableCount.toLocaleString()}</strong> delivery{deliveriesInTableCount !== 1 ? 's' : ''}. One row per delivery. Metrics will be calculated when formulas are added.
              {filterByCarriers.length > 0 && (
                <span className="block text-blue-600 mt-0.5">
                  Showing deliveries for carriers: {filterByCarriers.join(', ')}
                </span>
              )}
            </p>
            <div className="overflow-auto max-h-[400px] border-t border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                  <tr className="border-b border-slate-200">
                    <th className="text-left font-semibold text-slate-700 px-4 py-3 whitespace-nowrap">
                      Delivery
                    </th>
                    <th className="text-right font-semibold text-slate-700 px-4 py-3 whitespace-nowrap">
                      Number of parcels
                    </th>
                    <th className="text-right font-semibold text-slate-700 px-4 py-3 whitespace-nowrap">
                      Number of pallets
                    </th>
                    <th className="text-right font-semibold text-slate-700 px-4 py-3 whitespace-nowrap">
                      Dispatch to picking
                    </th>
                    <th className="text-right font-semibold text-slate-700 px-4 py-3 whitespace-nowrap">
                      Picking to packing
                    </th>
                    <th className="text-right font-semibold text-slate-700 px-4 py-3 whitespace-nowrap">
                      Packing to firm contents
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const deliveryIds = [...new Set(
                      rowsForTable
                        .map((r) => r[deliveryIdKey])
                        .filter((id): id is string => id != null && String(id).trim() !== '')
                        .map((id) => String(id).trim())
                    )].sort();
                    return deliveryIds.map((deliveryId) => (
                      <tr
                        key={deliveryId}
                        className="border-b border-slate-100 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {deliveryId}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          —
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          —
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          —
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          —
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          —
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {!loading && rows.length === 0 && !error && (
          <p className="text-slate-500 text-center py-12">
            Load a report to see deliveries per carrier and lines per step.
          </p>
        )}
      </main>
    </div>
  );
}

export default App;
