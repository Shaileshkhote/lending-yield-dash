export const DAY_SECONDS = 86_400;
export const HOUR_SECONDS = 3_600;

export type TimestampWindow = {
  startTimestamp: number;
  endTimestamp: number;
  startOfDay: number;
  dateString: string;
  startOfDayId: string;
};

export function utcDayWindow(date: string | Date): TimestampWindow {
  const dateString = typeof date === "string" ? date : utcDateString(date);
  const startTimestamp = unixTimestamp(`${dateString}T00:00:00.000Z`);
  return {
    startTimestamp,
    endTimestamp: startTimestamp + DAY_SECONDS,
    startOfDay: startTimestamp,
    dateString,
    startOfDayId: String(Math.floor(startTimestamp / DAY_SECONDS)),
  };
}

export function rollingWindow(now: Date, seconds = DAY_SECONDS): TimestampWindow {
  const endTimestamp = Math.floor(now.getTime() / 1000);
  const startTimestamp = endTimestamp - seconds;
  const startOfDay = utcDayWindow(now).startOfDay;
  return {
    startTimestamp,
    endTimestamp,
    startOfDay,
    dateString: utcDateString(now),
    startOfDayId: String(Math.floor(startOfDay / DAY_SECONDS)),
  };
}

export function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function unixTimestamp(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export function isDateBeforeStart(dateString: string, start?: string): boolean {
  return Boolean(start && dateString < start);
}

export function isDateAfterDeadFrom(dateString: string, deadFrom?: string): boolean {
  return Boolean(deadFrom && dateString >= deadFrom);
}
