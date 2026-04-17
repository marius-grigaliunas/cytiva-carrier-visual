import type { CarrierKpiThresholds, CarrierStats, TruckScheduleItem } from '../types/schedule';
import type { CarrierCutoffWindow } from '../utils/truckSchedule';
import { CarrierGantt } from './CarrierGantt';

interface CarrierGridProps {
  stats: CarrierStats[];
  /** Editable truck schedule - drives Gantt markers */
  trucks?: TruckScheduleItem[];
  /** Cutoff times per carrier (from sidebar settings) */
  cutoffsByCarrier?: Record<string, CarrierCutoffWindow>;
  /** KPI thresholds per carrier for row KPI coloring */
  kpiThresholdsByCarrier?: Record<string, CarrierKpiThresholds>;
  className?: string;
}

export function CarrierGrid({
  stats,
  trucks = [],
  cutoffsByCarrier,
  kpiThresholdsByCarrier,
  className = '',
}: CarrierGridProps) {
  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <CarrierGantt
        stats={stats}
        trucks={trucks}
        cutoffsByCarrier={cutoffsByCarrier}
        kpiThresholdsByCarrier={kpiThresholdsByCarrier}
        className="flex-1 min-h-0"
      />
    </div>
  );
}

export default CarrierGrid;
