import { Injectable } from '@nestjs/common';
import { centerOffsetMs as ecuadorOffset, dayMs, tabletStaleDays } from '../../common/time/center-time';
import { DashboardReadModel } from '../domain/ports/dashboard.read-model';

// Same threshold as the tablet list (spec 103): a tablet with no sync in 7 days counts as offline.
const weeksShown = 8;

// Monday 00:00 in Ecuador of the week of `now`, as an instant.
const weekStartOf = (now: Date) => {
  const local = new Date(now.getTime() - ecuadorOffset);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceMonday) + ecuadorOffset);
};

// The last 8 weeks, oldest first, with the local date of their Monday.
const lastWeeks = (now: Date) => {
  const current = weekStartOf(now).getTime();
  return Array.from({ length: weeksShown }, (_, i) => {
    const from = new Date(current - (weeksShown - 1 - i) * 7 * dayMs);
    return { from, weekStart: new Date(from.getTime() - ecuadorOffset).toISOString().slice(0, 10) };
  });
};

// Home of the center admin. "Today" is the Ecuador day unless the panel sends its own day start (local midnight).
@Injectable()
export class GetCenterOverviewUseCase {
  constructor(private readonly readModel: DashboardReadModel) {}

  execute(dayStart?: Date) {
    const now = new Date();
    const local = new Date(now.getTime() - ecuadorOffset);
    const start = dayStart ?? new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + ecuadorOffset);
    return this.readModel.centerOverview({
      now,
      dayStart: start,
      dayEnd: new Date(start.getTime() + dayMs),
      weekEnd: new Date(start.getTime() + 8 * dayMs),
      staleBefore: new Date(now.getTime() - tabletStaleDays * dayMs),
      monthAgo: new Date(now.getTime() - 30 * dayMs),
      weeks: lastWeeks(now),
    });
  }
}
