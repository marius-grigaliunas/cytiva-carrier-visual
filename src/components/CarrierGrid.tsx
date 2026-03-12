import type { CarrierStats } from '../types/schedule';
import { CarrierGantt } from './CarrierGantt';

interface CarrierGridProps {
  stats: CarrierStats[];
  className?: string;
  /** Optional: called when cutoffs change (for parent to recalc stats) */
  onCutoffChange?: (cutoffsByCarrier: Record<string, number>) => void;
}

export function CarrierGrid({ stats, className = '', onCutoffChange }: CarrierGridProps) {
  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <CarrierGantt stats={stats} onCutoffChange={onCutoffChange} className="flex-1 min-h-0" />
    </div>
  );
}

export default CarrierGrid;
