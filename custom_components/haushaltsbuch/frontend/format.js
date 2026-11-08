/* Haushaltsbuch panel – Language, number and date helpers shared by all parts of the panel.
 * Split out of haushaltsbuch-panel.js; plain ES module without build step.
 */
// Language of the panel: German for German HA users, English for everyone else.
let LANG = "de";
const tr = (de, en) => (LANG === "de" ? de : en);
const setLanguage = (language) => {
  LANG = String(language || "de").toLowerCase().startsWith("de") ? "de" : "en";
};
let DATE_LOCALE = "de-DE";
const setDateLocale = (locale) => {
  DATE_LOCALE = locale;
};
const fmtDate = (isoDate, opts) => parseIso(isoDate).toLocaleDateString(DATE_LOCALE, opts);
const monthName = (index, style = "long") => new Date(2020, index, 1).toLocaleDateString(LANG === "de" ? "de-DE" : DATE_LOCALE, { month: style }).replace(/\.$/, "");
const weekdayLong = (index) => new Date(2024, 0, 1 + index).toLocaleDateString(LANG === "de" ? "de-DE" : DATE_LOCALE, { weekday: "long" });
const WEEK_ORDINALS = [[1, "ersten", "first"], [2, "zweiten", "second"], [3, "dritten", "third"], [4, "vierten", "fourth"], [-1, "letzten", "last"]];
const weekdayName = (index) => new Date(2024, 0, 1 + index).toLocaleDateString(LANG === "de" ? "de-DE" : DATE_LOCALE, { weekday: "short" }).replace(/\.$/, "");

const SUGGEST_FIELDS = new Set(["icon", "category"]);
const INCOGNITO_KEY = "haushaltsbuch-incognito";

const CERTAINTY = {
  sicher: { de: "sicher", en: "certain", color: "var(--success-color, #43a047)" },
  wahrscheinlich: { de: "wahrscheinlich", en: "likely", color: "var(--warning-color, #ffa000)" },
  unsicher: { de: "unsicher", en: "uncertain", color: "var(--secondary-text-color, #888)" },
};
const certaintyLabel = (key) => (CERTAINTY[key] || CERTAINTY.unsicher)[LANG];

const FREQUENCY_PRESETS = [
  { key: "once", de: "einmalig", en: "once", frequency: "once", interval: 1 },
  { key: "weekly", de: "wöchentlich", en: "weekly", frequency: "weekly", interval: 1 },
  { key: "monthly", de: "monatlich", en: "monthly", frequency: "monthly", interval: 1 },
  { key: "monthly_weekday", de: "monatlich am Wochentag (z.B. letzter Do)", en: "monthly on a weekday (e.g. last Thu)", frequency: "monthly", interval: 1 },
  { key: "quarterly", de: "vierteljährlich", en: "quarterly", frequency: "monthly", interval: 3 },
  { key: "halfyearly", de: "halbjährlich", en: "every six months", frequency: "monthly", interval: 6 },
  { key: "yearly", de: "jährlich", en: "yearly", frequency: "yearly", interval: 1 },
  { key: "every_n_months", de: "alle X Monate", en: "every X months", frequency: "monthly", interval: null },
  { key: "fixed_dates", de: "feste Termine im Jahr", en: "fixed dates each year", frequency: "fixed_dates", interval: 1 },
  { key: "rolling", de: "gleitend (ab letztem Termin)", en: "rolling (from the last date)", frequency: "rolling", interval: null },
  { key: "budget", de: "Budget pro Monat (variable Ausgaben)", en: "monthly budget (variable spending)", frequency: "budget", interval: 1 },
];

const NOTICE_UNITS = { days: ["Tage", "days"], weeks: ["Wochen", "weeks"], months: ["Monate", "months"] };
const shortDay = (isoDate) => fmtDate(isoDate, { day: "2-digit", month: "2-digit" });
const shortDate = (isoDate) => fmtDate(isoDate, { day: "2-digit", month: "2-digit", year: "2-digit" });

const unitLabel = (n, unit) =>
  unit === "weeks" ? (n === 1 ? tr("Woche", "week") : tr("Wochen", "weeks")) : n === 1 ? tr("Monat", "month") : tr("Monate", "months");

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Parse an amount typed with comma or dot as decimal separator.
 * "1.234,56", "1,234.56", "12,5" and "12.5" all work. With only one kind of
 * separator, `decimal` (the user's decimal separator) decides about cases like
 * "1.200": a thousands separator for German users, 1.2 for English ones.
 * Returns NaN if empty or invalid.
 */
const parseAmount = (value, decimal = ",") => {
  if (typeof value === "number") return value;
  let text = String(value ?? "").trim().replace(/[\s\u00a0\u202f']/g, "");
  if (!text) return NaN;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    const decimal = lastComma > lastDot ? "," : ".";
    text = text.split(decimal === "," ? "." : ",").join("").replace(decimal, ".");
  } else if (lastComma > -1) {
    const grouped = /^-?\d{1,3}(,\d{3})+$/.test(text) && (decimal === "." || text.split(",").length > 2);
    text = grouped ? text.replace(/,/g, "") : text.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text) && (decimal === "," || text.split(".").length > 2)) {
    text = text.replace(/\./g, "");
  }
  return /^-?\d*\.?\d+$/.test(text) ? Number(text) : NaN;
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export { LANG, tr, setLanguage, DATE_LOCALE, fmtDate, monthName, weekdayLong, WEEK_ORDINALS, weekdayName, SUGGEST_FIELDS, INCOGNITO_KEY, CERTAINTY, certaintyLabel, FREQUENCY_PRESETS, NOTICE_UNITS, shortDay, shortDate, unitLabel, esc, parseAmount, iso, parseIso, addDays, today, setDateLocale };
