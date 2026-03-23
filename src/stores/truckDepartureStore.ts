import { create } from 'zustand';
import type { TruckScheduleItem } from '../types/schedule';

export type TruckStatus = 'present' | 'departed';

export interface TrackedTruck {
  carrier: string;
  name: string;
  time: string; // HH:mm for display
  status: TruckStatus;
  // Keeping departureMs makes the UI simpler; it is derived from App's trucks state.
  departureMs: number;
  id: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function msToHHmm(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

interface TruckDepartureStoreState {
  // Status is kept separately so we can immediately reflect UI updates
  // even if the full truck record hasn't been synced yet.
  statusById: Record<string, TruckStatus>;
  trucksById: Record<string, TrackedTruck>;
  syncTrucks: (trucks: TruckScheduleItem[]) => void;
  markDeparted: (id: string) => void;
  markPresent: (id: string) => void;
  reset: () => void;
}

export const useTruckDepartureStore = create<TruckDepartureStoreState>((set) => ({
  statusById: {} as Record<string, TruckStatus>,
  trucksById: {} as Record<string, TrackedTruck>,
  syncTrucks: (trucks) =>
    set((state) => {
      const next = { ...state.trucksById };
      const nextStatusById: Record<string, TruckStatus> = { ...state.statusById };
      for (const t of trucks) {
        const existing = next[t.id];
        const existingStatus = nextStatusById[t.id] ?? existing?.status;
        next[t.id] = {
          id: t.id,
          carrier: t.carrier,
          name: t.label,
          time: msToHHmm(t.departureMs),
          departureMs: t.departureMs,
          status: existingStatus ?? 'present',
        };
        nextStatusById[t.id] = next[t.id].status;
      }
      return { ...state, trucksById: next, statusById: nextStatusById };
    }),
  markDeparted: (id) =>
    set((state) => {
      const existing = state.trucksById[id];
      if (state.statusById[id] === 'departed' && existing?.status === 'departed') return state;
      const nextStatusById: Record<string, TruckStatus> = { ...state.statusById, [id]: 'departed' };
      if (!existing) {
        return { ...state, statusById: nextStatusById };
      }
      return {
        ...state,
        statusById: nextStatusById,
        trucksById: {
          ...state.trucksById,
          [id]: { ...existing, status: 'departed' },
        },
      };
    }),
  markPresent: (id) =>
    set((state) => {
      const existing = state.trucksById[id];
      if (state.statusById[id] === 'present' && existing?.status === 'present') return state;
      const nextStatusById: Record<string, TruckStatus> = { ...state.statusById, [id]: 'present' };
      if (!existing) return { ...state, statusById: nextStatusById };
      return {
        ...state,
        statusById: nextStatusById,
        trucksById: {
          ...state.trucksById,
          [id]: { ...existing, status: 'present' },
        },
      };
    }),
  reset: () =>
    set({
      trucksById: {} as Record<string, TrackedTruck>,
      statusById: {} as Record<string, TruckStatus>,
    }),
}));

