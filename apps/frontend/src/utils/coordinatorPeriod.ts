/** Període SROI compartit entre dashboard del coordinador i anàlisi avançada. */

export const COORDINATOR_PERIOD_DAYS = 365;

/** Per defecte: mateix que ProgramDashboard (últims ~120 dies fins avui). */
export const COORDINATOR_DEFAULT_START_OFFSET = COORDINATOR_PERIOD_DAYS - 120;
export const COORDINATOR_DEFAULT_END_OFFSET = COORDINATOR_PERIOD_DAYS;

export type CoordinatorPeriod = {
  periodStart: string;
  periodEnd: string;
  fmtStart: string;
  fmtEnd: string;
  selectedRangeDays: number;
};

export function computeCoordinatorPeriod(
  startDayOffset: number = COORDINATOR_DEFAULT_START_OFFSET,
  endDayOffset: number = COORDINATOR_DEFAULT_END_OFFSET,
): CoordinatorPeriod {
  const periodEndAnchor = new Date();
  periodEndAnchor.setHours(0, 0, 0, 0);

  const periodStartDate = new Date(periodEndAnchor);
  periodStartDate.setDate(
    periodEndAnchor.getDate() - (COORDINATOR_PERIOD_DAYS - startDayOffset),
  );

  const periodEndDate = new Date(periodEndAnchor);
  periodEndDate.setDate(
    periodEndAnchor.getDate() - (COORDINATOR_PERIOD_DAYS - endDayOffset),
  );

  const fmtOpts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };

  return {
    periodStart: periodStartDate.toISOString().slice(0, 10),
    periodEnd: periodEndDate.toISOString().slice(0, 10),
    fmtStart: periodStartDate.toLocaleDateString("ca-ES", fmtOpts),
    fmtEnd: periodEndDate.toLocaleDateString("ca-ES", fmtOpts),
    selectedRangeDays: Math.max(1, endDayOffset - startDayOffset + 1),
  };
}
