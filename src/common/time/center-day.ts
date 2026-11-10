import { Transform } from 'class-transformer';

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

const parse = (value: unknown, clock: string) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && dateOnly.test(value)) return new Date(`${value}T${clock}-05:00`);
  return new Date(value as string);
};

// A period sent as bare days means whole days of the center (UTC-5): "to=2026-10-31" reaches that night, not 19:00 of the 30th.
// A full instant is taken as it comes. An invalid date stays invalid, so IsDate rejects it.
export const CenterDayStart = () => Transform(({ value }) => parse(value, '00:00:00.000'));
export const CenterDayEnd = () => Transform(({ value }) => parse(value, '23:59:59.999'));
