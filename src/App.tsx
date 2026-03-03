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
  const [filterByCarrier, setFilterByCarrier] = useState<string | null>(null);
  const [filterByStep, setFilterByStep] = useState<string | null>(null);

  const rowsForCarrierChart = filterByStep && stepKey
    ? rows.filter((r) => (r[stepKey] != null ? String(r[stepKey]).trim() : '') === filterByStep)
    : rows;
  const rowsForStepChart = filterByCarrier && shipMethodKey
    ? rows.filter((r) => getCarrierFromShipMethod(r[shipMethodKey] != null ? String(r[shipMethodKey]) : '') === filterByCarrier)
    : rows;

  const byCarrier = (() => {
    const counts = deliveriesByCarrier(rowsForCarrierChart, shipMethodKey, deliveryIdKey);
    const order = getCarrierOrder();
    return [...counts].sort((a, b) => order.indexOf(a.carrier) - order.indexOf(b.carrier));
  })();
  const byStep = stepKey ? linesByStep(rowsForStepChart, stepKey) : [];
  const totalDeliveries = uniqueDeliveryCount(rows, deliveryIdKey);
  const totalLines = rows.length;
  const maxCarrier = Math.max(1, ...byCarrier.map((c) => c.count));
  const maxStep = Math.max(1, ...byStep.map((s) => s.count));
  const hasFilter = filterByCarrier !== null || filterByStep !== null;

  const loadFromUrl = useCallback(async () => {
    setError(null);
    setLoading(true);
    setFilterByCarrier(null);
    setFilterByStep(null);
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
      setFilterByCarrier(null);
      setFilterByStep(null);
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
            headers.find((h) =>
              /delivery\s*id|shipment\s*id|order\s*id|tracking\s*(number|id)/i.test(h)
            ) ?? '';
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

        {hasFilter && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-slate-600">Filter:</span>
            {filterByCarrier && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-blue-800">
                Carrier: {filterByCarrier}
                <button
                  type="button"
                  aria-label="Clear carrier filter"
                  onClick={() => setFilterByCarrier(null)}
                  className="rounded-full hover:bg-blue-200 p-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {filterByStep && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">
                Step: {filterByStep}
                <button
                  type="button"
                  aria-label="Clear step filter"
                  onClick={() => setFilterByStep(null)}
                  className="rounded-full hover:bg-emerald-200 p-0.5"
                >
                  ×
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => { setFilterByCarrier(null); setFilterByStep(null); }}
              className="text-slate-500 underline hover:text-slate-700"
            >
              Clear all
            </button>
          </div>
        )}

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
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
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
                {filterByStep && (
                  <span className="block text-emerald-600 mt-0.5">
                    Showing for step: {filterByStep}
                  </span>
                )}
              </p>
              <div className="space-y-4">
                {byCarrier.map(({ carrier, count }) => (
                  <button
                    type="button"
                    key={carrier}
                    onClick={() => setFilterByCarrier((c) => (c === carrier ? null : carrier))}
                    className={`w-full flex items-center gap-4 text-left rounded-lg p-1 -m-1 transition-colors ${
                      filterByCarrier === carrier ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-32 shrink-0 text-sm font-medium text-slate-700">
                      {carrier}
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 h-8 bg-slate-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded min-w-[2px] transition-all duration-300"
                          style={{ width: `${(count / maxCarrier) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-sm tabular-nums text-slate-600 font-medium">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">Click a carrier to filter by step</p>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-1">
                Lines per step status
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Total lines: <strong>{totalLines.toLocaleString()}</strong>
                {filterByCarrier && (
                  <span className="block text-blue-600 mt-0.5">
                    Showing for carrier: {filterByCarrier}
                  </span>
                )}
              </p>
              {stepKey ? (
                <div className="space-y-4">
                  {byStep.map(({ step, count }) => (
                    <button
                      type="button"
                      key={step}
                      onClick={() => setFilterByStep((s) => (s === step ? null : step))}
                      className={`w-full flex items-center gap-4 text-left rounded-lg p-1 -m-1 transition-colors ${
                        filterByStep === step ? 'ring-2 ring-emerald-500 ring-offset-2 bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-36 shrink-0 text-sm font-medium text-slate-700">
                        {step}
                      </div>
                      <div className="flex-1 flex items-center gap-3">
                        <div className="flex-1 h-8 bg-slate-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded min-w-[2px] transition-all duration-300"
                            style={{ width: `${(count / maxStep) * 100}%` }}
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
              <p className="text-xs text-slate-400 mt-3">Click a step to filter by carrier</p>
            </section>
          </div>
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
