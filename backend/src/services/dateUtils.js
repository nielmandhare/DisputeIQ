// Shared, dependency-free date parsing for Indian dispute documents.
// Used by the timeline extraction engine. Pure functions, no side effects.
// 'now' year is used only when a year is genuinely absent from the text
// (preserving the `datePrecision` flag so callers never invent a date).

export const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Matches: 15 March, March 15, 15/03, 15-03-2024, 2024-03-15, 15th March, 12 Mar 2024
export const DATE_RE = /(\b\d{1,2}\s?(?:st|nd|rd|th)?\s?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)|(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?\d{1,2}(?:st|nd|rd|th)?\b)|(\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b)|(\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b)/gi;

// Matches: 2:43 PM, 14:43, 10:14 am, 2.30pm
export const TIME_RE = /\b(\d{1,2})(?::|\.)(\d{2})\s?(am|pm)?\b/i;

export function parseTime(text) {
  const m = text.match(TIME_RE);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const lower = m[3].toLowerCase();
    if (lower === 'pm' && h < 12) h += 12;
    if (lower === 'am' && h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Returns { iso, precision } or { iso: null, precision: 'unknown' }.
// iso is 'YYYY-MM-DD' when a full/known date is present, else null.
export function parseDate(text) {
  const low = text.toLowerCase();
  // ISO yyyy-mm-dd / yyyy/mm/dd
  let iso = low.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (iso) {
    const y = +iso[1], mo = +iso[2], d = +iso[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, precision: 'date' };
  }
  // dd/mm/yy or dd-mm-yyyy
  let dm = low.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (dm) {
    const d = +dm[1], mo = +dm[2];
    let year = null, precision = 'month';
    if (dm[3]) { year = +dm[3]; if (year < 100) year += 2000; precision = 'date'; }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return { iso: year ? `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null, precision };
    }
  }
  // month name with day: "15 March" / "March 15"
  const md = low.match(/\b(\d{1,2})\s?(?:st|nd|rd|th)?\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  const md2 = low.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?(\d{1,2})/);
  if (md) {
    const d = +md[1], mo = MONTHS[md[2]];
    return isoFor(mo, d);
  }
  if (md2) {
    const d = +md2[2], mo = MONTHS[md2[1]];
    return isoFor(mo, d);
  }
  return { iso: null, precision: 'unknown' };
}

function isoFor(month, day) {
  // No year in the text: do not invent one. Keep month-level precision.
  if (month == null || day == null) return { iso: null, precision: 'unknown' };
  return { iso: null, precision: 'month', month: month + 1, day };
}

// Build a comparable sort key: ISO dates first (by date), then month-only, then unknown.
// Returns a tuple [tier, sortableString] where tier 0 = full datetime, 1 = date, 2 = month, 3 = unknown.
export function timelineSortKey(event) {
  if (event.eventDate) {
    const base = event.eventDate;
    const tier = event.eventTime ? 0 : 1;
    return [tier, `${base}T${event.eventTime || '00:00'}`];
  }
  if (event.datePrecision === 'month' && event._month != null) {
    return [2, `${String(event._month).padStart(2, '0')}-${String(event._day).padStart(2, '0')}`];
  }
  return [3, 'zzz'];
}
