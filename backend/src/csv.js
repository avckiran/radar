// RFC 4180 CSV that opens cleanly in Excel, Numbers and Google Sheets.
const BOM = '﻿';

// Cells that start like a formula could run when opened in a spreadsheet, so they get a leading apostrophe
function guard(text) {
  return /^[=+@\t\r]/.test(text) || /^-[^\d\s.]/.test(text) ? `'${text}` : text;
}

export function cell(value) {
  if (value === null || value === undefined) return '';
  let text;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  if (typeof value === 'string') text = guard(text);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
