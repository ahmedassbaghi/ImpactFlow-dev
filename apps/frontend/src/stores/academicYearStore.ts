import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AcademicYearItem = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  active: boolean;
};

type AcademicYearState = {
  years: AcademicYearItem[];
  selectedYearId: string | null;
  currentYearId: string | null;
  setYears: (years: AcademicYearItem[]) => void;
  setSelectedYearId: (id: string | null) => void;
  getSelectedYearId: () => string | null;
};

export const useAcademicYearStore = create<AcademicYearState>()(
  persist(
    (set, get) => ({
      years: [],
      selectedYearId: null,
      currentYearId: null,
      setYears: (years) => {
        const current = years.find((y) => y.is_current);
        const selected = get().selectedYearId;
        const validSelected = selected && years.some((y) => y.id === selected);
        set({
          years,
          currentYearId: current?.id ?? null,
          selectedYearId: validSelected ? selected : current?.id ?? years[0]?.id ?? null,
        });
      },
      setSelectedYearId: (id) => set({ selectedYearId: id }),
      getSelectedYearId: () => get().selectedYearId ?? get().currentYearId,
    }),
    { name: "if-academic-year", partialize: (s) => ({ selectedYearId: s.selectedYearId }) }
  )
);

export function academicYearQueryParam(): { academic_year_id?: string } {
  const id = useAcademicYearStore.getState().getSelectedYearId();
  return id ? { academic_year_id: id } : {};
}
