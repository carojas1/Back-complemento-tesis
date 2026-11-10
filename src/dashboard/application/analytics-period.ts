import { dayMs } from '../../common/time/center-time';
const defaultDays = 30;
const maxDays = 366;

// The period every metric reads: 30 days by default and never more than a year, so a request cannot scan the whole history.
export function resolvePeriod(from?: Date, to?: Date) {
  const end = to ?? new Date();
  const requested = from ?? new Date(end.getTime() - defaultDays * dayMs);
  const start = end.getTime() - requested.getTime() > maxDays * dayMs ? new Date(end.getTime() - maxDays * dayMs) : requested;
  return { from: start, to: end };
}
