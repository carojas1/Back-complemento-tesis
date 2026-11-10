// Centers work in Ecuador time (UTC-5, no daylight saving). Weekdays, opening hours and week buckets are all local to it.
export const centerOffsetMs = 5 * 60 * 60_000;

const local = (date: Date) => new Date(date.getTime() - centerOffsetMs);

// 0 = Sunday, as Date.getUTCDay.
export const centerWeekday = (date: Date) => local(date).getUTCDay();

export const centerMinuteOfDay = (date: Date) => {
  const shifted = local(date);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

export const dayMs = 24 * 60 * 60_000;

// The center's calendar day as a number, to compare two moments by day.
export const centerDayNumber = (date: Date) => Math.floor(local(date).getTime() / dayMs);
// A tablet that has not synced in this long needs someone to look at it.
export const tabletStaleDays = 7;
