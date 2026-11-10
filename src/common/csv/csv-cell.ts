// One CSV value. A value starting with = + - @ runs as a formula when the file is opened in a spreadsheet (OWASP CSV Injection), and a name
// or a note can be typed by anyone, so it gets a leading quote that shows it as text.
export function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : typeof value === 'string'
          ? value
          : JSON.stringify(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
