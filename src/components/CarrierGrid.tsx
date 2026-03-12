import type { CarrierStats, TruckScheduleItem } from '../types/schedule';
import { CarrierGantt } from './CarrierGantt';

interface CarrierGridProps {
  stats: CarrierStats[];
  /** Editable truck schedule - drives Gantt markers */
  trucks?: TruckScheduleItem[];
  /** Cutoff times per carrier (from sidebar settings) */
  cutoffsByCarrier?: Record<string, number>;
  className?: string;
}

export function CarrierGrid({ stats, trucks = [], cutoffsByCarrier, className = '' }: CarrierGridProps) {
  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <CarrierGantt
        stats={stats}
        trucks={trucks}
        cutoffsByCarrier={cutoffsByCarrier}
        className="flex-1 min-h-0"
      />
    </div>
  );
}

export default CarrierGrid;
