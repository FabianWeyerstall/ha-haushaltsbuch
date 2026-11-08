/* Haushaltsbuch panel – Bank import: Outbank CSV (unchanged reader), other bank CSVs, CAMT.053,
 * own transfers, and matching of bookings to items. Runs in the browser only.
 * Split out of haushaltsbuch-panel.js; plain ES module without build step.
 */
import { tr, parseAmount, iso, parseIso, addDays } from "./format.js";

// ------------------------------------------------------------- bank CSV import
// The CSV is read in the browser only. Nothing but the ticked suggestions is
// sent to Home Assistant, as a normal import of new entries.

const CSV_COLUMNS = {
  date: ["datum", "buchungstag", "buchungsdatum", "date"],
  amount: ["betrag", "betrag (eur)", "betrag in eur", "umsatz", "amount"],
  name: ["name", "empfänger", "zahlungsempfänger", "auftraggeber/empfänger", "beguenstigter/zahlungspflichtiger", "name zahlungsbeteiligter", "payee"],
  purpose: ["zweck", "verwendungszweck", "purpose", "description"],
  category: ["kategorie", "category"],
  text: ["buchungstext", "art der zahlung", "umsatzart"],
  mandate: ["mandatsreferenz", "mandate reference"],
  creditor: ["gläubiger id", "glaeubiger id", "gläubiger-id", "creditor id"],
  account: ["konto", "auftragskonto", "eigenes konto", "account"],
  main: ["hauptkategorie", "main category"],
  counter: ["nummer", "iban zahlungsbeteiligter", "kontonummer/iban", "iban", "counterparty iban"],
};

/** Split CSV text into rows of fields; handles quotes and ; , or tab. */
function splitCsv(text, forced = null) {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join("\n");
  const delimiter = forced || [";", "\t", ","].sort((a, b) => firstLines.split(b).length - firstLines.split(a).length)[0];
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseCsvDate(value) {
  const s = String(value || "").trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(new Date(year, Number(m[2]) - 1, Number(m[1])));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Bookings from a bank CSV: [{date, amount, name, purpose, category, text, mandate, creditor}]. */
function parseBankCsv(text) {
  const rows = splitCsv(text.replace(/^﻿/, ""));
  const headerIndex = rows.findIndex((r) => {
    const cells = r.map((c) => c.trim().toLowerCase());
    return CSV_COLUMNS.date.some((n) => cells.includes(n)) && CSV_COLUMNS.amount.some((n) => cells.includes(n));
  });
  if (headerIndex < 0) throw new Error(tr("In der Datei fehlen die Spalten Datum und Betrag.", "The file has no date and amount columns."));
  const header = rows[headerIndex].map((c) => c.trim().toLowerCase());
  const col = Object.fromEntries(Object.entries(CSV_COLUMNS).map(([key, names]) => [key, names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1]));
  const bookings = [];
  for (const r of rows.slice(headerIndex + 1)) {
    const get = (key) => (col[key] >= 0 ? String(r[col[key]] ?? "").trim() : "");
    const date = parseCsvDate(get("date"));
    const amount = parseAmount(get("amount").replace(/[€]|EUR/g, ""), ",");
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    const account = get("account").replace(/\s/g, "").toUpperCase();
    const counter = get("counter").replace(/\s/g, "").toUpperCase();
    bookings.push({ date, amount, name: get("name") || get("purpose").slice(0, 40), purpose: get("purpose"), category: get("category"), main: get("main"), text: get("text"), mandate: get("mandate"), creditor: get("creditor"), account, counter });
  }
  if (!bookings.length) throw new Error(tr("In der Datei wurden keine Umsätze gefunden.", "No transactions were found in the file."));
  return bookings;
}

/**
 * Drop transfers between the imported accounts: the counterparty is one of
 * them, or the same amount leaves one account and arrives in another within
 * three days. Returns {bookings, transfers}.
 */
function dropOwnTransfers(bookings) {
  const accounts = new Set(bookings.map((b) => b.account).filter(Boolean));
  if (accounts.size < 2) return { bookings, transfers: 0 };
  const drop = new Set(bookings.filter((b) => b.counter && accounts.has(b.counter) && b.counter !== b.account));
  const incoming = bookings.filter((b) => b.amount > 0 && !drop.has(b));
  for (const out of bookings.filter((b) => b.amount < 0 && !drop.has(b) && !b.counter)) {
    const days = isCardSettlement(out.name, out.purpose) ? 10 : 3;
    const twin = incoming.find((b) => !drop.has(b) && b.account !== out.account && Math.abs(b.amount + out.amount) < 0.005 && Math.abs(daysBetween(out.date, b.date)) <= days);
    if (twin) drop.add(out).add(twin);
  }
  return { bookings: bookings.filter((b) => !drop.has(b)), transfers: drop.size };
}

// ------------------------------------------------------------ other banks
// Outbank files keep the path above unchanged. Every other bank goes through
// the reader below: it finds the header line itself, copes with debit/credit
// columns, other date and number formats and SEPA tags in the purpose, and
// asks the user which column is what when it is not sure (remembered per header).

const BANK_FIELDS = ["date", "amount", "debit", "credit", "sign", "name", "payer", "purpose", "category", "text", "mandate", "creditor", "account", "counter"];
const BANK_ALIASES = {
  date: ["buchungstag", "buchungsdatum", "datum", "buchung", "booking date", "transaction date", "date", "wertstellung", "valutadatum", "valuta", "value date"],
  amount: ["betrag", "betrag (eur)", "betrag in eur", "betrag eur", "betrag (€)", "umsatz", "umsatz in eur", "betrag in euro", "amount", "amount (eur)", "value"],
  debit: ["soll", "belastung", "ausgang", "debit", "abgang", "lastschrift (eur)", "soll (eur)"],
  credit: ["haben", "gutschrift", "eingang", "credit", "zugang", "haben (eur)"],
  sign: ["soll/haben", "s/h", "soll haben", "kennung", "debit/credit", "credit/debit indicator"],
  name: ["name", "empfaenger", "zahlungsempfaenger", "zahlungsempfaenger*in", "auftraggeber/empfaenger", "auftraggeber / beguenstigter", "beguenstigter/zahlungspflichtiger", "beguenstigter/auftraggeber", "auftraggeber/zahlungsempfaenger", "empfaenger/zahlungspflichtiger", "name zahlungsbeteiligter", "name des zahlungsbeteiligten", "zahlungsbeteiligter", "gegenpartei", "payee", "counterparty", "partner name", "beneficiary", "name gegenkonto", "gegenueber", "gegenkonto name"],
  // Some banks name the payer of incoming money in a column of its own.
  payer: ["zahlungspflichtige*r", "zahlungspflichtiger", "auftraggeber", "auftraggeber*in", "payer"],
  purpose: ["verwendungszweck", "zweck", "vorgang/verwendungszweck", "verwendungszweck/ kundenreferenz", "buchungsdetails", "beschreibung", "purpose", "description", "payment reference", "reference", "details"],
  category: ["kategorie", "category"],
  text: ["buchungstext", "umsatzart", "art der zahlung", "vorgang", "transaction type", "type", "art"],
  mandate: ["mandatsreferenz", "mandatsref", "mandate reference", "mandate"],
  creditor: ["glaeubiger id", "glaeubiger-id", "glaeubiger identifikation", "glaeubigerid", "creditor id"],
  account: ["auftragskonto", "eigenes konto", "kontonummer auftraggeber", "konto", "account", "iban auftragskonto"],
  counter: ["iban zahlungsbeteiligter", "kontonummer/iban", "iban", "gegenkonto", "iban gegenkonto", "counterparty iban", "kontonummer"],
};
const normCell = (c) => String(c ?? "").replace(/^﻿/, "").trim().toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/\s+/g, " ").replace(/^"|"$/g, "");

/** True for an Outbank export, which keeps the original reader. */
function isOutbankCsv(text) {
  return text.split(/\r?\n/, 12).some((line) => /(^|[;,\t])hauptkategorie([;,\t]|$)/i.test(line) && /(^|[;,\t])kategoriepfad([;,\t]|$)/i.test(line));
}

/** Bytes to text: UTF-8, or Windows-1252 for older exports. */
function decodeBankBytes(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (err) {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function detectDelimiter(text) {
  // Separators inside quoted text ("Miete; Garage") don't count.
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40).map((l) => l.replace(/"[^"]*"/g, '""'));
  let best = ";";
  let bestScore = -1;
  for (const d of [";", "\t", ",", "|"]) {
    const counts = lines.map((l) => l.split(d).length - 1).filter((c) => c > 0);
    if (!counts.length) continue;
    const freq = {};
    for (const c of counts) freq[c] = (freq[c] || 0) + 1;
    const [mode, times] = Object.entries(freq).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0];
    const score = times * 10 + Number(mode);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** Column of each field in a header line: exact name first, then a name that starts like it. */
function bankColumns(header) {
  const cells = header.map(normCell);
  const used = new Set();
  const columns = {};
  for (const exact of [true, false]) {
    for (const field of BANK_FIELDS) {
      if (columns[field] !== undefined) continue;
      for (const alias of BANK_ALIASES[field]) {
        const i = cells.findIndex((c, idx) => !used.has(idx) && c && (exact ? c === alias : c.startsWith(`${alias} `) || c.startsWith(`${alias}(`)));
        if (i >= 0) { columns[field] = i; used.add(i); break; }
      }
    }
  }
  return columns;
}

const DATE_PATTERNS = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/;
function detectDateFormat(values) {
  let dmy = 0;
  let mdy = 0;
  let ymd = 0;
  for (const v of values) {
    const s = String(v || "").trim();
    if (/^\d{8}$/.test(s)) { ymd++; continue; }
    const m = s.match(DATE_PATTERNS);
    if (!m) continue;
    if (m[1].length === 4) ymd++;
    else if (s.includes(".")) dmy++;
    else if (Number(m[1]) > 12) dmy++;
    else if (Number(m[2]) > 12) mdy++;
  }
  return ymd > dmy && ymd > mdy ? "ymd" : mdy > dmy ? "mdy" : "dmy";
}
function parseDateAs(value, format) {
  const s = String(value || "").trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const m = s.match(DATE_PATTERNS);
  if (!m) return null;
  let [y, mo, d] = format === "ymd" || m[1].length === 4 ? [m[1], m[2], m[3]] : format === "mdy" ? [m[3], m[1], m[2]] : [m[3], m[2], m[1]];
  if (y.length === 2) y = `20${y}`;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || Number(y) < 1990 || Number(y) > 2100) return null;
  return iso(date);
}
function detectDecimal(values) {
  let comma = 0;
  let dot = 0;
  for (const v of values) {
    const s = String(v || "").replace(/[^\d.,]/g, "");
    if (/,\d{1,2}$/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s)) dot++;
  }
  return dot > comma ? "." : ",";
}
/** A money cell: "1.234,56", "-12.50", "12,00 EUR", "12,00 S", "12,00-". */
function parseMoneyCell(value, decimal) {
  let s = String(value || "").trim();
  if (!s) return NaN;
  let sign = 1;
  if (/\s?S$/i.test(s) && !/EUR$/i.test(s)) { sign = -1; s = s.replace(/\s?S$/i, ""); }
  else if (/\s?H$/i.test(s)) s = s.replace(/\s?H$/i, "");
  if (/-$/.test(s)) { sign = -sign; s = s.slice(0, -1); }
  if (/^\(.*\)$/.test(s)) { sign = -sign; s = s.slice(1, -1); }
  s = s.replace(/€|eur|euro/gi, "").replace(/^\+/, "").trim();
  const v = parseAmount(s, decimal);
  return Number.isFinite(v) ? v * sign : NaN;
}

/** SEPA tags in a purpose ("EREF+… MREF+… CRED+… SVWZ+…"). */
function parseSepaTags(text) {
  const s = String(text || "");
  if (!/\b(EREF|MREF|CRED|SVWZ|KREF|ABWA)\+/.test(s)) return null;
  const parts = {};
  const re = /\b(EREF|KREF|MREF|CRED|DEBT|SVWZ|ABWA|ABWE|IBAN|BIC|COAM|OAMT)\+/g;
  const marks = [...s.matchAll(re)];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : s.length;
    parts[m[1]] = s.slice(m.index + m[0].length, end).trim();
  });
  const before = s.slice(0, marks[0].index).trim();
  return { purpose: [parts.SVWZ || "", before].filter(Boolean).join(" ").trim(), mandate: parts.MREF || "", creditor: parts.CRED || "", name: parts.ABWA || "" };
}

/** The Haushaltsbuch category of a booking from its texts, or "" without a rule. */
function ruleCategory(b) {
  const haystack = `${b.name} ${b.purpose}`.toLowerCase();
  for (const [re, category] of CSV_CATEGORY_RULES) if (re.test(haystack)) return category;
  return "";
}

/** Error that opens the "which column is what" dialog instead of a message. */
const needsMapping = (info) => Object.assign(new Error(tr("Die Spalten der Datei wurden nicht sicher erkannt.", "The file's columns were not recognised reliably.")), { needsMapping: true, info });

/** Header line and column guess of a CSV that is not from Outbank. */
function guessBankLayout(text) {
  const delimiter = detectDelimiter(text);
  const rows = splitCsv(text.replace(/^﻿/, ""), delimiter).filter((r) => r.some((c) => String(c).trim()));
  let headerRow = -1;
  let columns = {};
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const c = bankColumns(rows[i]);
    if (c.date !== undefined && (c.amount !== undefined || c.debit !== undefined || c.credit !== undefined)) { headerRow = i; columns = c; break; }
  }
  const sample = headerRow >= 0 ? rows.slice(headerRow + 1, headerRow + 41) : rows.slice(0, 40);
  const col = (field) => sample.map((r) => r[columns[field]]);
  return {
    rows,
    delimiter,
    headerRow,
    columns,
    date: columns.date !== undefined ? detectDateFormat(col("date")) : "dmy",
    decimal: detectDecimal([...(columns.amount !== undefined ? col("amount") : []), ...(columns.debit !== undefined ? col("debit") : []), ...(columns.credit !== undefined ? col("credit") : [])]),
  };
}

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const CREDITOR_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{3,28}$/;
const MONEY_RE = /^[-+(]?\s?\d{1,3}([.,'\s]?\d{3})*([.,]\d{1,2})?\s?(€|eur)?\s?[-)SH]?$/i;

/** How well the values of a column fit a field: {fit, of} over the first data rows. */
function columnFit(rows, headerRow, index, field, dateFormat, decimal) {
  const values = rows.slice(headerRow + 1, headerRow + 41).map((r) => String(r[index] ?? "").trim());
  const filled = values.filter(Boolean);
  const test = {
    date: (v) => Boolean(parseDateAs(v, dateFormat)),
    amount: (v) => MONEY_RE.test(v) && Number.isFinite(parseMoneyCell(v, decimal)),
    debit: (v) => MONEY_RE.test(v),
    credit: (v) => MONEY_RE.test(v),
    sign: (v) => /^(s|h|soll|haben|d|c|dbit|crdt|debit|credit|\+|-)$/i.test(v),
    account: (v) => IBAN_RE.test(v.replace(/\s/g, "").toUpperCase()) || /^\d{5,12}$/.test(v),
    counter: (v) => IBAN_RE.test(v.replace(/\s/g, "").toUpperCase()) || /^\d{5,12}$/.test(v),
    creditor: (v) => CREDITOR_RE.test(v.replace(/\s/g, "").toUpperCase()) && /ZZZ/i.test(v),
    mandate: (v) => /^[\w./+-]{3,35}$/.test(v),
  }[field] || ((v) => /\p{L}/u.test(v));
  // Debit and credit columns are often empty in every other row.
  const base = ["debit", "credit"].includes(field) ? filled : values;
  return { fit: base.filter((v) => v && test(v)).length, of: base.length };
}

/**
 * Columns suggested from their contents, for files whose headings say nothing.
 * Keeps what the headings already gave.
 */
function suggestColumns(rows, headerRow, columns, dateFormat, decimal) {
  const result = { ...columns };
  const suggested = new Set();
  const width = Math.max(0, ...rows.slice(headerRow, headerRow + 20).map((r) => r.length));
  const used = new Set(Object.values(result));
  const free = () => Array.from({ length: width }, (_, i) => i).filter((i) => !used.has(i));
  const score = (i, field) => {
    const f = columnFit(rows, headerRow, i, field, dateFormat, decimal);
    return f.of ? f.fit / f.of : 0;
  };
  const take = (field, i) => { result[field] = i; used.add(i); suggested.add(field); };
  const sample = (i) => rows.slice(headerRow + 1, headerRow + 41).map((r) => String(r[i] ?? "").trim());
  if (result.date === undefined) {
    const best = free().find((i) => score(i, "date") >= 0.8);
    if (best !== undefined) take("date", best);
  }
  if (result.amount === undefined && result.debit === undefined && result.credit === undefined) {
    const money = free().filter((i) => score(i, "amount") >= 0.8 && sample(i).some((v) => /\d/.test(v)));
    // A column with minus signs is the amount; one without is often the balance.
    const signed = money.find((i) => sample(i).some((v) => /^-|-$|^\(/.test(v)));
    if (signed !== undefined) take("amount", signed);
    else {
      const halves = free().filter((i) => score(i, "debit") >= 0.8 && sample(i).some(Boolean) && sample(i).some((v) => !v));
      if (halves.length >= 2) { take("debit", halves[0]); take("credit", halves[1]); }
      else if (money.length) take("amount", money[0]);
    }
  }
  if (result.creditor === undefined) {
    const c = free().find((i) => sample(i).some((v) => /ZZZ/.test(v)) && score(i, "creditor") >= 0.3);
    if (c !== undefined) take("creditor", c);
  }
  const ibans = free().filter((i) => score(i, "counter") >= 0.5 && sample(i).some((v) => IBAN_RE.test(v.replace(/\s/g, "").toUpperCase())));
  for (const i of ibans) {
    const distinct = new Set(sample(i).filter(Boolean)).size;
    if (distinct === 1 && result.account === undefined) take("account", i);
    else if (distinct > 1 && result.counter === undefined) take("counter", i);
  }
  const texts = free().map((i) => {
    const v = sample(i).filter(Boolean);
    return { i, share: score(i, "name"), len: v.reduce((a, x) => a + x.length, 0) / Math.max(1, v.length), distinct: new Set(v).size / Math.max(1, v.length) };
  }).filter((t) => t.share >= 0.6);
  // Text columns: a clearly longer one is the purpose; otherwise banks put the payee first.
  const byLength = [...texts].sort((a, b) => b.len - a.len);
  if (result.purpose === undefined && byLength.length && byLength[0].len >= 15 && (byLength.length === 1 || byLength[0].len >= 1.8 * byLength[1].len)) {
    take("purpose", byLength[0].i);
    texts.splice(texts.indexOf(byLength[0]), 1);
  }
  if (result.name === undefined && texts.length) take("name", texts[0].i);
  if (result.purpose === undefined && texts.length > 1) take("purpose", texts[1].i);
  return { columns: result, suggested };
}

/** The line with the headings when no known heading was found: the one above the first dated line. */
function guessHeaderRow(rows) {
  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const format = detectDateFormat(rows[i]);
    if (rows[i].some((c) => parseDateAs(String(c).trim(), format)) && rows[i].filter((c) => String(c).trim()).length >= 3) return Math.max(0, i - 1);
  }
  return 0;
}

const bankSignature = (rows, headerRow) => (rows[headerRow] || []).map(normCell).join(";").slice(0, 300);

/** Bookings of a CSV that is not from Outbank, with an optional hand-made profile. */
function parseGenericCsv(text, profiles = {}, force = null) {
  const layout = guessBankLayout(text);
  let { rows, headerRow, columns, date: dateFormat, decimal } = layout;
  const known = headerRow >= 0 ? profiles[bankSignature(rows, headerRow)] : null;
  // A remembered profile may have its header further down than the guess found.
  const profile = force || known || Object.values(profiles).find((p) => rows[p.header_row] && profiles[bankSignature(rows, p.header_row)] === p) || null;
  if (profile) {
    headerRow = profile.header_row;
    columns = profile.columns;
    dateFormat = profile.date || dateFormat;
    decimal = profile.decimal || decimal;
  }
  const info = { ...layout, headerRow: Math.max(0, headerRow), columns, date: dateFormat, decimal };
  if (headerRow < 0 || columns.date === undefined || (columns.amount === undefined && columns.debit === undefined && columns.credit === undefined)) throw needsMapping(info);
  // Without payee and purpose nothing could be matched: better ask once.
  if (!profile && columns.name === undefined && columns.purpose === undefined) throw needsMapping(info);
  // Banks without an account column often name the IBAN above the table.
  const ibanAbove = rows.slice(0, headerRow).flat().map((c) => String(c).replace(/\s/g, "").toUpperCase()).find((c) => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(c)) || "";
  const bookings = [];
  let bad = 0;
  for (const r of rows.slice(headerRow + 1)) {
    const get = (field) => (columns[field] !== undefined && columns[field] >= 0 ? String(r[columns[field]] ?? "").trim() : "");
    const day = parseDateAs(get("date"), dateFormat);
    let amount;
    if (columns.amount !== undefined) {
      amount = parseMoneyCell(get("amount"), decimal);
      const sign = get("sign").toLowerCase();
      if (sign) amount = Math.abs(amount) * (/^(s|d|soll|debit|dbit|-|belastung|ausgang)/.test(sign) ? -1 : 1);
    } else {
      const debit = parseMoneyCell(get("debit"), decimal);
      const credit = parseMoneyCell(get("credit"), decimal);
      amount = (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0);
    }
    if (!day || !Number.isFinite(amount) || amount === 0) {
      if (r.filter((c) => String(c).trim()).length > 2) bad++;
      continue;
    }
    let purpose = get("purpose");
    let mandate = get("mandate");
    let creditor = get("creditor");
    let name = (amount > 0 && get("payer")) || get("name");
    const sepa = parseSepaTags(purpose);
    if (sepa) {
      purpose = sepa.purpose;
      mandate ||= sepa.mandate;
      creditor ||= sepa.creditor;
      name ||= sepa.name;
    }
    mandate ||= purpose.match(/mandat(?:sreferenz|sref\.?|s-?ref)?:?\s+([A-Z0-9][\w./-]{2,34})/i)?.[1] || "";
    creditor ||= purpose.match(/gl(?:ä|ae)ubiger-?(?:id|identifikation)?:?\s+([A-Z]{2}\d{2}[A-Z0-9]{3,30})/i)?.[1] || "";
    const b = {
      date: day, amount, name: name || purpose.slice(0, 40), purpose, category: get("category"), main: "", text: get("text"), mandate, creditor,
      account: get("account").replace(/\s/g, "").toUpperCase() || ibanAbove, counter: get("counter").replace(/\s/g, "").toUpperCase(), generic: true,
    };
    if (!b.category) b.category = ruleCategory(b);
    b.main = b.category;
    bookings.push(b);
  }
  // Mostly unreadable rows: the guess is wrong, so ask.
  if (!bookings.length || (!profile && bad > bookings.length)) throw needsMapping(info);
  return bookings;
}

// ------------------------------------------------------------ CAMT.053
const xmlKids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const xmlPath = (el, path) => path.split("/").reduce((node, name) => (node ? xmlKids(node, name)[0] || null : null), el);
const xmlText = (el, path) => (xmlPath(el, path)?.textContent || "").trim();

/** Bookings of a CAMT.053 statement (ISO 20022 XML). */
function parseCamt(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(tr("Die XML-Datei ist beschädigt.", "The XML file is damaged."));
  const statements = [...doc.getElementsByTagNameNS("*", "Stmt"), ...doc.getElementsByTagNameNS("*", "Rpt")];
  const bookings = [];
  for (const st of statements) {
    const account = (xmlText(st, "Acct/Id/IBAN") || xmlText(st, "Acct/Id/Othr/Id")).replace(/\s/g, "").toUpperCase();
    for (const entry of xmlKids(st, "Ntry")) {
      if (xmlText(entry, "Sts") && !/BOOK/.test(xmlText(entry, "Sts"))) continue;
      const debit = xmlText(entry, "CdtDbtInd") === "DBIT";
      const day = (xmlText(entry, "BookgDt/Dt") || xmlText(entry, "BookgDt/DtTm") || xmlText(entry, "ValDt/Dt")).slice(0, 10);
      const details = xmlKids(xmlPath(entry, "NtryDtls"), "TxDtls");
      const entryAmount = Number(xmlText(entry, "Amt"));
      const parts = details.length ? details : [null];
      for (const tx of parts) {
        const own = tx && (xmlText(tx, "Amt") || xmlText(tx, "AmtDtls/TxAmt/Amt"));
        const value = parts.length > 1 && own ? Number(own) : entryAmount;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(value) || !value) continue;
        const txDebit = tx && xmlText(tx, "CdtDbtInd") ? xmlText(tx, "CdtDbtInd") === "DBIT" : debit;
        const other = txDebit ? "Cdtr" : "Dbtr";
        const name = tx ? (xmlText(tx, `RltdPties/${other}/Nm`) || xmlText(tx, `RltdPties/${other}/Pty/Nm`) || xmlText(tx, `RltdPties/Ultmt${other}/Nm`)) : "";
        const purpose = tx ? xmlKids(xmlPath(tx, "RmtInf"), "Ustrd").map((u) => u.textContent.trim()).join(" ") : "";
        const info = xmlText(entry, "AddtlNtryInf") || (tx ? xmlText(tx, "AddtlTxInf") : "");
        const creditor = tx ? (xmlText(tx, "RltdPties/Cdtr/Id/PrvtId/Othr/Id") || xmlText(tx, "RltdPties/Cdtr/Pty/Id/PrvtId/Othr/Id") || xmlText(tx, "Refs/CdtrSchmeId/Id/PrvtId/Othr/Id")) : "";
        const b = {
          date: day, amount: Math.round((txDebit ? -1 : 1) * value * 100) / 100, name: name || info || purpose.slice(0, 40), purpose: purpose || info,
          category: "", main: "", text: info, mandate: tx ? xmlText(tx, "Refs/MndtId") : "", creditor: txDebit ? creditor : "",
          account, counter: (tx ? xmlText(tx, `RltdPties/${other}Acct/Id/IBAN`) : "").replace(/\s/g, "").toUpperCase(), generic: true,
        };
        b.category = ruleCategory(b);
        b.main = b.category;
        bookings.push(b);
      }
    }
  }
  if (!bookings.length) throw new Error(tr("In der CAMT-Datei wurden keine gebuchten Umsätze gefunden.", "No booked transactions were found in the CAMT file."));
  return bookings;
}
const isCamt = (text) => /<\?xml|<Document/i.test(text.slice(0, 500)) && /BkToCstmr(Stmt|AcctRpt)/.test(text.slice(0, 5000));

// Upper limits so that a broken or manipulated file can't freeze the browser.
const MAX_BANK_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_FILES = 100;
const tooBig = (name) => new Error(tr(`„${name}“ ist zu groß (höchstens 50 MB).`, `“${name}” is too large (50 MB at most).`));

/** Unpack deflated data, stopping as soon as it grows beyond the limit (ZIP bombs). */
async function inflateCapped(data, name) {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BANK_BYTES) {
      await reader.cancel().catch(() => {});
      throw tooBig(name);
    }
    parts.push(value);
  }
  return new Blob(parts).arrayBuffer();
}

/** The CSV and XML files inside a ZIP (CAMT exports often come zipped). */
async function unzipBankFiles(buffer) {
  try {
    return await readZip(buffer);
  } catch (err) {
    if (err instanceof RangeError || err instanceof TypeError) throw new Error(tr("Die ZIP-Datei ist beschädigt.", "The ZIP file is damaged."));
    throw err;
  }
}

async function readZip(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(tr("Die ZIP-Datei ist beschädigt.", "The ZIP file is damaged."));
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = [];
  for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.(xml|csv|txt)$/i.test(name) || name.startsWith("__MACOSX")) continue;
    if (files.length >= MAX_ZIP_FILES) break;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = new Uint8Array(buffer, start, size);
    let bytes;
    if (method === 0) bytes = data.slice().buffer;
    else if (method === 8) bytes = await inflateCapped(data, name);
    else continue;
    files.push({ name, text: decodeBankBytes(bytes) });
  }
  return files;
}

/** Files from the file picker as {name, text}; ZIP archives are unpacked. */
async function readBankSources(files) {
  const sources = [];
  for (const f of files) {
    if (f.size > MAX_BANK_BYTES) throw tooBig(f.name);
    const buffer = await f.arrayBuffer();
    const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
    if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4) sources.push(...(await unzipBankFiles(buffer)).map((x) => ({ name: `${f.name}/${x.name}`, text: x.text })));
    else {
      const text = decodeBankBytes(buffer);
      // Pictures, PDFs and other binary files: say so instead of guessing columns.
      const sample = text.slice(0, 4000);
      if (sample && (sample.match(/[\u0000-\u0008\u000e-\u001f\ufffd]/g) || []).length > sample.length / 20) {
        throw new Error(tr(`„${f.name}“ ist keine Text- oder CSV-Datei.`, `“${f.name}” is not a text or CSV file.`));
      }
      sources.push({ name: f.name, text });
    }
  }
  return sources;
}

/** Bookings of one file: Outbank as before, CAMT, or any other CSV. */
function parseBankSource(source, profiles, force = null) {
  if (isCamt(source.text)) return { kind: "camt", bookings: parseCamt(source.text) };
  if (!force && isOutbankCsv(source.text)) return { kind: "outbank", bookings: parseBankCsv(source.text) };
  try {
    return { kind: "csv", bookings: parseGenericCsv(source.text, profiles, force) };
  } catch (err) {
    if (force || !err.needsMapping) throw err;
    // Whatever the earlier reader understood keeps working.
    try {
      return { kind: "csv", bookings: parseBankCsv(source.text) };
    } catch (ignored) {
      throw err;
    }
  }
}

const LEGAL_FORMS = /\b(gmbh( & co\.? kg)?|ag|se|kg|e\.?\s?v\.?|aktiengesellschaft|deutschland|europe|sales|mbh)\b\.?/gi;
const nameKey = (name) => name.toLowerCase().replace(LEGAL_FORMS, "").replace(/[^a-zäöüß ]/g, " ").split(/\s+/).filter((w) => w.length > 2).slice(0, 2).join(" ");
const tidyName = (name) => {
  const clean = name.replace(LEGAL_FORMS, "").replace(/[\/,]+$/, "").replace(/\s{2,}/g, " ").trim() || name.trim();
  return clean === clean.toUpperCase() ? clean.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : clean;
};

// Bank category or text → [category, icon] of the Haushaltsbuch.
const CSV_CATEGORY_RULES = [
  [/gehalt|lohn|bezüge|salary/, "Gehalt", "mdi:briefcase"],
  [/rundfunk|beitragsservice/, "Rundfunk", "mdi:radio-tower"],
  [/einspeis|photovoltaik|pv-anlage|solar/, "Photovoltaik", "mdi:solar-power-variant"],
  [/strom|energie|stadtwerke/, "Strom", "mdi:flash"],
  [/wasser/, "Wasser", "mdi:water"],
  [/handy|mobilfunk/, "Internet & Telefon", "mdi:cellphone"],
  [/internet|telefon|festnetz/, "Internet & Telefon", "mdi:router-wireless"],
  [/lebensversicherung|rentenversicherung|altersvorsorge/, "Versicherungen", "mdi:shield-check"],
  [/\bkfz|\bauto(?!mat)|\bpkw\b|motorrad/, "Auto", "mdi:car"],
  [/versicherung/, "Versicherungen", "mdi:shield-check"],
  [/miete|wohnen|nebenkosten/, "Wohnen", "mdi:home"],
  [/kredit|darlehen|finanzierung/, "Kredite", "mdi:bank"],
  [/sparen|sparplan|bauspar|depot/, "Sparen", "mdi:piggy-bank"],
  [/steuer|finanzamt/, "Steuern", "mdi:bank"],
  [/streaming|tv|musik/, "TV & Streaming", "mdi:television"],
  [/verein|mitglied/, "Vereine", "mdi:account-group"],
  [/kinder|kita|kindergarten/, "Kinder", "mdi:human-male-child"],
  [/gesundheit|apotheke|arzt|fitness/, "Gesundheit & Pflege", "mdi:heart-pulse"],
  [/lebensmittel|supermarkt/, "Lebensmittel", "mdi:cart"],
  [/tanken|tankstelle/, "Auto", "mdi:gas-station"],
];
function csvCategory(booking) {
  // Payee and purpose first, the bank's category ("Handy & Internet") only as fallback.
  for (const haystack of [`${booking.name} ${booking.purpose}`, booking.category].map((t) => t.toLowerCase())) {
    for (const [re, category, icon] of CSV_CATEGORY_RULES) if (re.test(haystack)) return { category, icon };
  }
  return { category: booking.category || tr("Sonstiges", "Other"), icon: "mdi:repeat" };
}

const CSV_RHYTHMS = [
  { min: 6, max: 8, frequency: "weekly", interval: 1, minCount: 4 },
  { min: 13, max: 16, frequency: "weekly", interval: 2, minCount: 3 },
  { min: 26, max: 35, frequency: "monthly", interval: 1, minCount: 3 },
  { min: 55, max: 66, frequency: "monthly", interval: 2, minCount: 3 },
  { min: 84, max: 98, frequency: "monthly", interval: 3, minCount: 2 },
  { min: 170, max: 195, frequency: "monthly", interval: 6, minCount: 2 },
  { min: 350, max: 380, frequency: "yearly", interval: 1, minCount: 2 },
];
const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** Week of the month (1-4, or -1 for the last) if all dates share weekday and week. */
function commonWeekday(dates) {
  const days = dates.map(parseIso);
  const weekday = (days[0].getDay() + 6) % 7;
  if (!days.every((d) => (d.getDay() + 6) % 7 === weekday)) return null;
  const isLast = (d) => d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (days.every(isLast)) return { weekday, week: -1 };
  const week = Math.ceil(days[0].getDate() / 7);
  return week <= 4 && days.every((d) => Math.ceil(d.getDate() / 7) === week) ? { weekday, week } : null;
}

function nthWeekday(year, month, weekday, week) {
  if (week === -1) {
    const d = new Date(year, month + 1, 0);
    while ((d.getDay() + 6) % 7 !== weekday) d.setDate(d.getDate() - 1);
    return d;
  }
  const d = new Date(year, month, 1);
  while ((d.getDay() + 6) % 7 !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7 * (week - 1));
  return d;
}

function nextDue(dateIso, rhythm) {
  const d = parseIso(dateIso);
  if (rhythm.frequency === "weekly") return iso(addDays(d, 7 * rhythm.interval));
  if (rhythm.weekday !== undefined) return iso(nthWeekday(d.getFullYear(), d.getMonth() + 1, rhythm.weekday, rhythm.week));
  const months = rhythm.frequency === "yearly" ? 12 : rhythm.interval;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return iso(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay)));
}

const CARD_PAYMENT = /karte|kartenzahlung|debitkarte|visa|girocard|pos\b/i;
/** A credit card bill paid from the current account: the real purchases are on the card. */
const CARD_SETTLEMENT = /american express|\bamex\b|kreditkarten?[- ]?(abrechnung|ausgleich|saldo|rechnung)|(visa|mastercard)[- ]?(card )?(abrechnung|ausgleich)|kartenabrechnung/i;
const isCardSettlement = (name, purpose) => CARD_SETTLEMENT.test(`${name || ""} ${purpose || ""}`);
const RARE_WORDS = /versicherung|steuer|beitrag|verein|mitglied|jahres|wartung|tüv|gebühr|abo\b|lizenz/i;

// Words that say what kind of contract it is, not with whom: "Lebensversicherung"
// must not match an item called "Autoversicherung".
const GENERIC_WORDS = /^(versicherung(en)?|\w*versicherung|steuer(n)?|\w*steuer|beitr(ag|äge)|rechnung|gebühr(en)?|vertrag|kredit|darlehen|miete|sparen|sparplan|lastschrift|überweisung|dauerauftrag|zahlung|abschlag|rate|monat(lich)?|jahr(es)?|kosten|konto|bank|service|online|abo|kunde|kunden|mandat|referenz|gmbh)$/;
const wordsOf = (text) => String(text || "").toLowerCase().replace(LEGAL_FORMS, " ").replace(/[^a-zäöüß ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !GENERIC_WORDS.test(w));

/**
 * How well does this existing item fit a payee (0 = not at all)? A name hit
 * counts most, but only with a similar amount; without a name the amount must
 * be (almost) exact and day or category must agree.
 */
function similarity(item, name, purpose, category, amount, day, amounts = [amount]) {
  const expected = Number(item.current_amount ?? item.amount) || 0;
  if (!expected || !amount) return 0;
  const diff = Math.abs(expected - amount) / Math.max(expected, amount);
  const words = wordsOf(item.name);
  const hit = (text) => {
    const bank = wordsOf(text);
    return words.some((w) => bank.some((x) => x === w || x.startsWith(w) || (x.length >= 5 && w.startsWith(x))));
  };
  const itemDay = Number(String(item.start_date).slice(8));
  const dayGap = day && itemDay ? Math.abs(itemDay - day) : 99;
  const sameDay = Math.min(dayGap, 31 - dayGap) <= 4;
  const sameCategory = item.category === category;
  if (hit(name) && diff <= 0.35) return 4 - diff;
  if (hit(purpose) && diff <= 0.15) return 3.5 - diff;
  // Without the name, one equal amount is chance: most bookings of the payee must fit.
  const fitting = amounts.filter((a) => Math.abs(expected - a) / Math.max(expected, a) <= 0.15).length;
  if (fitting < Math.max(1, amounts.length * 0.75)) return 0;
  if (amounts.length < 2 && !(sameDay && sameCategory && diff <= 0.01)) return 0;
  if (diff <= 0.01 && (sameDay || sameCategory)) return 3 - diff;
  if (sameCategory && sameDay && diff <= 0.15) return 2 - diff;
  if (sameCategory && diff <= 0.05) return 1.5 - diff;
  return 0;
}

/** The existing item that fits best, or undefined. */
function bestItem(items, direction, name, purpose, category, amount, day, amounts) {
  let best;
  let bestScore = 0;
  for (const item of items) {
    if (item.direction !== direction) continue;
    const score = similarity(item, name, purpose, category, amount, day, amounts);
    if (score > bestScore) [best, bestScore] = [item, score];
  }
  return best;
}

/**
 * Compare bank bookings with the existing items.
 * - bookings that belong to an item (remembered bank key or a look-alike) are
 *   matched to its open dates and confirmed, price changes are noticed;
 * - card payments of a budget's category become its spendings;
 * - the rest is checked for regular, rare and rolling payments.
 * `entries` are forecast entries of the own items over the file's period,
 * `history` is the answer of haushaltsbuch/bank/history.
 */
function analyzeBank(bookings, items, history, entries) {
  const from = bookings.reduce((m, b) => (b.date < m ? b.date : m), bookings[0].date);
  const to = bookings.reduce((m, b) => (b.date > m ? b.date : m), bookings[0].date);
  const recurringItems = items.filter((i) => i.schedule?.frequency !== "budget");
  const budgetItems = items.filter((i) => i.schedule?.frequency === "budget");
  const keyOwner = new Map();
  for (const i of items) for (const k of history[i.id]?.bank_keys || []) keyOwner.set(k, i);

  // Suggestions look at the last two years; older history only shows what comes once a year.
  const recentFrom = iso(addDays(parseIso(to), -730));
  const groups = new Map();
  for (const b of bookings) {
    b.direction = b.amount < 0 ? "expense" : "income";
    b.key = bankKeyOf(b);
    if (!groups.has(b.key)) groups.set(b.key, { key: b.key, list: [] });
    groups.get(b.key).list.push(b);
  }

  const used = new Set();
  const matches = [];
  const suggestions = [];
  const others = [];
  for (const group of groups.values()) {
    const full = group.list.sort((a, b) => a.date.localeCompare(b.date));
    const recent = full.filter((b) => b.date >= recentFrom);
    if (!recent.length) continue; // ended long ago (old flat, old provider)
    // One-off amounts within a regular series (annual settlement, refund) are looked at separately.
    const usual = median(recent.map((b) => Math.abs(b.amount)));
    const cardGroup = full.every((b) => CARD_PAYMENT.test(`${b.text} ${b.purpose}`));
    // A second booking in the same month of a monthly payee is extra, e.g. the annual statement.
    const extra = new Set();
    if (!cardGroup) {
      const byMonth = {};
      for (const b of full) (byMonth[b.date.slice(0, 7)] ||= []).push(b);
      for (const same of Object.values(byMonth)) {
        if (same.length < 2) continue;
        same.sort((x, y) => Math.abs(Math.abs(x.amount) - usual) - Math.abs(Math.abs(y.amount) - usual)).slice(1).forEach((b) => extra.add(b));
      }
    }
    const isOutlier = (b) => !cardGroup && recent.length >= 4 && (extra.has(b) || (Math.abs(Math.abs(b.amount) - usual) > usual * 0.5 && Math.abs(b.amount) > 20));
    const list = recent.filter((b) => !isOutlier(b));
    const outliers = full.filter(isOutlier);
    if (outliers.length) {
      const settlement = keyOwner.get(`${group.key}|y`);
      if (settlement) {
        const match = matchItem(settlement, outliers.filter((b) => b.date >= recentFrom), entries, history[settlement.id]);
        if (match.confirmations.length) matches.push({ ...match, priceChange: null, key: `i:${settlement.id}`, bankKey: `${group.key}|y`, item: settlement, bankName: tidyName(outliers[0].name), remembered: true, checked: true, bookings: outliers.filter((b) => b.date >= recentFrom) });
      } else {
        const yearly = settlementSuggestion(group, outliers, to);
        if (yearly) others.push({ ...yearly, checked: false, target: "new" });
      }
      outliers.forEach((b) => used.add(b));
    }
    if (!list.length) continue;
    const last = list[list.length - 1];
    const amount = Math.abs(last.amount);
    const { category, icon } = csvCategory(last);
    const card = list.every((b) => CARD_PAYMENT.test(`${b.text} ${b.purpose}`));
    const day = Number(last.date.slice(8));
    // 1. Known item: remembered key, otherwise a look-alike (not for card payments).
    let item = keyOwner.get(group.key);
    if (item?.schedule?.frequency === "budget") continue; // handled with the budgets below
    let remembered = Boolean(item);
    if (!item && !card) item = bestItem(recurringItems, last.direction, last.name, last.purpose, category, amount, day, list.map((b) => Math.abs(b.amount)));
    if (item) {
      // Known payee: never suggested again, even when there is nothing to confirm
      // (e.g. the item was entered after these bookings).
      const match = matchItem(item, list, entries, history[item.id]);
      list.forEach((b) => used.add(b));
      if (remembered && !match.confirmations.length && !match.priceChange) continue; // known and up to date
      matches.push({ ...match, key: `i:${item.id}`, bankKey: group.key, item, bankName: tidyName(last.name), remembered, checked: true, bookings: list });
      continue;
    }
    // 2. New regular payment; yearly ones also from the whole history.
    let suggestion = recurringSuggestion(group, list, to, category, icon);
    if (!suggestion && full.length > list.length) {
      const longRun = recurringSuggestion(group, full.filter((b) => !isOutlier(b)), to, category, icon);
      if (longRun && (longRun.schedule.frequency === "yearly" || longRun.schedule.interval >= 6)) suggestion = longRun;
    }
    if (suggestion) {
      full.forEach((b) => used.add(b));
      if (suggestion.schedule.frequency === "yearly") {
        const all = full.filter((b) => !isOutlier(b));
        Object.assign(suggestion, { count: all.length, first: all[0].date });
      }
    }
    if (suggestion) {
      list.forEach((b) => used.add(b));
      const twin = bestItem(recurringItems, suggestion.direction, suggestion.name, last.purpose, category, amount, day, list.map((b) => Math.abs(b.amount)));
      suggestions.push({ ...suggestion, existing: twin ? twin.name : null, checked: !twin, target: "new" });
      continue;
    }
    // 3. Rare (seen once, yearly?) or rolling (irregular but repeating).
    const other = card ? null : rareSuggestion(group, list, to, category, icon);
    const rolling = rollingSuggestion(group, list, to, category, icon);
    if (other || rolling) {
      list.forEach((b) => used.add(b));
      others.push({ ...(rolling || other), checked: false, target: "new" });
    }
  }

  // Budgets: card payments by bank category, from the last two years.
  const months = Math.max(1, daysBetween(from > recentFrom ? from : recentFrom, to) / 30.4);
  const byCategory = new Map();
  for (const b of bookings) {
    if (used.has(b) || b.amount > 0 || b.date < recentFrom) continue;
    const { category, icon } = csvCategory(b);
    const name = b.category || category;
    if (!byCategory.has(name)) byCategory.set(name, { name, category, icon, total: 0, list: [] });
    const entry = byCategory.get(name);
    entry.total += -b.amount;
    entry.list.push(b);
  }
  // Which budget? A remembered bank category, or a word of the budget's name in
  // the bank category ("Tanken" ↔ "Tankstelle"), payee or purpose. The category
  // alone only counts for a budget named like it ("Auto" takes all car costs,
  // "Tanken" in category Auto does not take the workshop).
  const stems = (text) => wordsOf(text).map((w) => w.slice(0, Math.max(4, w.length - 2)));
  const budgetStems = budgetItems.map((i) => ({ item: i, stems: stems(i.name) }));
  const stemHit = (text, list) => {
    const words = wordsOf(text);
    return list.some((st) => words.some((w) => w.startsWith(st)));
  };
  const assigned = new Map();
  const assign = (budget, b, learnKey) => {
    if (!assigned.has(budget.id)) assigned.set(budget.id, { budget, list: [], keys: new Set() });
    const entry = assigned.get(budget.id);
    entry.list.push(b);
    if (learnKey) entry.keys.add(learnKey);
  };
  for (const c of [...byCategory.values()]) {
    const remembered = keyOwner.get(`c:${c.name}`);
    const byBankCategory = remembered?.schedule?.frequency === "budget" ? remembered : budgetStems.find((x) => stemHit(c.name, x.stems))?.item;
    const rest = [];
    for (const b of c.list) {
      const byPayee = keyOwner.get(b.key);
      if (byPayee?.schedule?.frequency === "budget") { assign(byPayee, b, null); continue; }
      if (byBankCategory) { assign(byBankCategory, b, `c:${c.name}`); continue; }
      const byText = budgetStems.find((x) => stemHit(`${b.name} ${b.purpose}`, x.stems))?.item;
      const sameCategory = budgetItems.filter((i) => i.category === c.category);
      const generic = sameCategory.length === 1 && sameCategory[0].name.toLowerCase() === sameCategory[0].category.toLowerCase() ? sameCategory[0] : null;
      if (byText || generic) assign(byText || generic, b, null);
      else rest.push(b);
    }
    c.list = rest;
    c.total = rest.reduce((t, b) => t - b.amount, 0);
  }
  const budgetMatches = [];
  for (const { budget, list, keys } of assigned.values()) {
    // Entered by hand already? Same amount within two days counts as the same purchase.
    const known = (history[budget.id]?.spendings || []).map(([date, amount]) => ({ date, amount, taken: false }));
    const fresh = list.filter((b) => {
      if (b.date < budget.start_date) return false;
      const twin = known.find((k) => !k.taken && Math.abs(k.amount - Math.abs(b.amount)) < 0.005 && Math.abs(daysBetween(k.date, b.date)) <= 2);
      if (twin) twin.taken = true;
      return !twin;
    }).sort((x, y) => y.date.localeCompare(x.date));
    if (!fresh.length) continue;
    budgetMatches.push({
      key: `s:${budget.id}`,
      item: budget,
      bankKeys: [...keys],
      remembered: [...keys].every((k) => keyOwner.get(k) === budget),
      spendings: fresh.map((b) => ({ target: budget.id, date: b.date, amount: Math.abs(b.amount), note: tidyName(b.name), category: csvCategory(b).category })),
      bookings: fresh,
      checked: true,
    });
  }
  // Recent payments that fit no budget can still be assigned by hand.
  const earliest = budgetItems.reduce((m, i) => (i.start_date < m ? i.start_date : m), "9999");
  const loose = [...byCategory.values()].flatMap((c) => c.list).filter((b) => b.date >= earliest).sort((x, y) => y.date.localeCompare(x.date));
  if (loose.length) {
    budgetMatches.push({
      key: "s:rest",
      rest: true,
      item: { id: "rest", name: tr("Weitere Zahlungen", "Other payments"), icon: "mdi:help-circle-outline" },
      bankKeys: [],
      remembered: true,
      spendings: loose.map((b) => ({ target: "skip", date: b.date, amount: Math.abs(b.amount), note: tidyName(b.name), category: csvCategory(b).category })),
      bookings: loose,
      checked: true,
    });
  }
  const budgets = [];
  for (const c of byCategory.values()) {
    if (c.list.length && c.list.length >= months * 2 && c.category !== tr("Sonstiges", "Other")) {
      budgets.push({ key: `b:${c.name}`, name: c.name, category: c.category, icon: c.icon, amount: Math.ceil(c.total / months / 10) * 10, count: c.list.length, bankKey: `c:${c.name}`, cardPayments: c.list, checked: false });
    }
  }
  budgets.sort((a, b) => b.amount - a.amount).splice(3);
  suggestions.sort((a, b) => (a.direction === b.direction ? b.amount / (b.schedule.interval || 1) - a.amount / (a.schedule.interval || 1) : a.direction === "income" ? -1 : 1));
  return { matches: [...matches, ...budgetMatches], suggestions, others, budgets, from, to, count: bookings.length };
}

const bankKeyOf = (b) => (b.creditor ? `m:${b.creditor}|${b.mandate}` : `n:${nameKey(b.name)}|${b.amount < 0 ? "expense" : "income"}`);

/** Annual settlement: unusual amounts of a regular payee, about the same time every year. */
function settlementSuggestion(group, outliers, to) {
  const years = new Set(outliers.map((b) => b.date.slice(0, 4)));
  if (years.size < 2) return null;
  const last = outliers[outliers.length - 1];
  if (daysBetween(last.date, to) > 420) return null;
  const dayOfYear = (b) => daysBetween(`${b.date.slice(0, 4)}-01-01`, b.date);
  const ref = dayOfYear(last);
  const near = outliers.filter((b) => {
    const diff = Math.abs(dayOfYear(b) - ref);
    return Math.min(diff, 365 - diff) <= 45;
  });
  if (new Set(near.map((b) => b.date.slice(0, 4))).size < 2) return null;
  const amounts = near.map((b) => b.amount);
  const typical = median(amounts.map(Math.abs));
  const refunds = amounts.filter((a) => a > 0).length;
  const direction = refunds > amounts.length / 2 ? "income" : "expense";
  const { category, icon } = csvCategory(last);
  const next = nextDue(last.date, { frequency: "yearly", interval: 1 });
  return {
    key: `${group.key}|y`, bankKey: `${group.key}|y`, kind: "settlement",
    name: tr(`Jahresabrechnung ${tidyName(last.name)}`, `Annual statement ${tidyName(last.name)}`),
    direction, amount: Math.round(typical * 100) / 100, variance: 100, category, icon: direction === "income" ? "mdi:cash-refund" : "mdi:file-document-alert",
    count: near.length, years: [...new Set(near.map((b) => b.date.slice(0, 4)))].sort(), mixed: refunds > 0 && refunds < amounts.length,
    first: near[0].date, last: last.date, due: last.date, next, debit: false,
    schedule: { frequency: "yearly", interval: 1, unit: "months" }, tolerance: 30, certainty: "unsicher",
  };
}

/** Bookings of an existing item → confirmations of its open dates, and a possible price change. */
function matchItem(item, list, entries, history) {
  const confirmed = new Set(history?.confirmed || []);
  const open = entries.filter((e) => e.item_id === item.id && e.status === null && !confirmed.has(e.due_date));
  const window = Math.max(10, (item.date_tolerance_days || 0) + 7);
  const taken = new Set();
  const confirmations = [];
  const pairs = [];
  for (const b of list) {
    const best = open
      .filter((e) => !taken.has(e.due_date) && Math.abs(daysBetween(e.date, b.date)) <= window)
      .sort((x, y) => Math.abs(daysBetween(x.date, b.date)) - Math.abs(daysBetween(y.date, b.date)))[0];
    if (!best) continue;
    taken.add(best.due_date);
    confirmations.push({ item_id: item.id, due_date: best.due_date, actual_date: b.date, actual_amount: Math.abs(b.amount) });
    pairs.push({ due: best.due_date, expected: Math.abs(best.amount), actual: Math.abs(b.amount) });
  }
  // Price change: the last bookings agree with each other but not with the item.
  let priceChange = null;
  const variance = Number(item.amount_variance_pct) || 0;
  const recent = pairs.slice(-3);
  if (variance === 0 && recent.length >= 2) {
    const now = recent[recent.length - 1].actual;
    const steady = recent.every((p) => Math.abs(p.actual - now) < 0.01);
    const differs = Math.abs(recent[recent.length - 1].expected - now) > Math.max(0.5, now * 0.005);
    if (steady && differs) {
      let firstNew = pairs.length - 1;
      while (firstNew > 0 && Math.abs(pairs[firstNew - 1].actual - now) < 0.01) firstNew--;
      priceChange = { item_id: item.id, from: pairs[firstNew].due, amount: now, before: recent[recent.length - 1].expected, checked: true };
    }
  }
  return { confirmations, priceChange, lastDate: list[list.length - 1].date };
}

function recurringSuggestion(group, list, to, category, icon) {
  if (list.length < 2) return null;
  const gaps = list.slice(1).map((b, i) => daysBetween(list[i].date, b.date)).filter((g) => g > 3);
  if (!gaps.length) return null;
  const gap = median(gaps);
  let rhythm = CSV_RHYTHMS.find((r) => gap >= r.min && gap <= r.max);
  if (!rhythm || list.length < rhythm.minCount) return null;
  if (gaps.filter((g) => Math.abs(g - gap) > gap * 0.25).length > gaps.length / 4) return null;
  const last = list[list.length - 1];
  // A booking that stopped well before the end of the file is probably cancelled.
  if (daysBetween(last.date, to) > gap * 1.6) return null;
  const sameDay = list.every((b) => b.date.slice(8) === list[0].date.slice(8));
  const weekdayRule = rhythm.frequency === "monthly" && rhythm.interval === 1 && !sameDay ? commonWeekday(list.map((b) => b.date)) : null;
  if (weekdayRule) rhythm = { ...rhythm, ...weekdayRule };
  const amount = Math.abs(last.amount);
  // A step in the amount (e.g. new electricity instalment) is a price change, not a variation.
  let since = list.length - 1;
  while (since > 0 && Math.abs(Math.abs(list[since - 1].amount) - amount) < 0.01) since--;
  const steadyNow = list.length - since >= 2 && since > 0;
  const considered = steadyNow ? list.slice(since) : list.slice(-6);
  const spread = Math.max(...considered.map((b) => Math.abs(Math.abs(b.amount) - amount))) / amount;
  const variance = spread < 0.005 ? 0 : Math.min(100, Math.ceil((spread * 100) / 5) * 5);
  // Nominal date: the usual day of the month when booked after a weekend.
  let due = last.date;
  if (rhythm.frequency !== "weekly" && !weekdayRule) {
    const counts = {};
    for (const b of list) counts[b.date.slice(8)] = (counts[b.date.slice(8)] || 0) + 1;
    const usual = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
    const d = parseIso(last.date);
    const candidate = new Date(d.getFullYear(), d.getMonth(), Math.min(usual, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    if (Math.abs(daysBetween(iso(candidate), last.date)) <= 4) due = iso(candidate);
  }
  return {
    key: group.key,
    bankKey: group.key,
    name: category === "Gehalt" ? tr("Gehalt", "Salary") : tidyName(last.name),
    direction: last.direction,
    amount,
    variance,
    category,
    icon,
    count: list.length,
    first: list[0].date,
    last: last.date,
    due,
    next: nextDue(due, rhythm),
    debit: Boolean(last.mandate || /lastschrift/i.test(last.text)),
    priceStep: steadyNow ? { since: list[since].date, before: Math.abs(list[since - 1].amount) } : null,
    schedule: { frequency: rhythm.frequency, interval: rhythm.interval, unit: "months", ...(weekdayRule || {}) },
    tolerance: 0,
    certainty: variance > 20 ? "unsicher" : variance > 0 ? "wahrscheinlich" : "sicher",
  };
}

/** Seen once, looks like a yearly fee (insurance, club, tax): ask whether it repeats. */
function rareSuggestion(group, list, to, category, icon) {
  if (list.length !== 1) return null;
  const b = list[0];
  if (b.amount > -30 || !RARE_WORDS.test(`${b.name} ${b.purpose} ${b.category}`)) return null;
  // In a file of more than a year it would have come again already.
  if (daysBetween(b.date, to) > 380) return null;
  const rhythm = { frequency: "yearly", interval: 1 };
  return {
    key: group.key, bankKey: group.key, kind: "rare",
    name: tidyName(b.name), direction: "expense", amount: -b.amount, variance: 0, category, icon,
    count: 1, first: b.date, last: b.date, due: b.date, next: nextDue(b.date, rhythm),
    debit: Boolean(b.mandate || /lastschrift/i.test(b.text)),
    schedule: { frequency: "yearly", interval: 1, unit: "months" }, tolerance: 14, certainty: "unsicher",
  };
}

/** Irregular but repeating, like the hairdresser: rolling from the last date. */
function rollingSuggestion(group, list, to, category, icon) {
  if (list.length < 3) return null;
  const gaps = list.slice(1).map((b, i) => daysBetween(list[i].date, b.date));
  const gap = median(gaps);
  if (gap < 20 || gap > 120 || Math.min(...gaps) < 10) return null;
  const last = list[list.length - 1];
  if (daysBetween(last.date, to) > gap * 2) return null;
  const amounts = list.map((b) => Math.abs(b.amount));
  const avg = amounts.reduce((a, x) => a + x, 0) / amounts.length;
  const spread = Math.max(...amounts.map((a) => Math.abs(a - avg))) / avg;
  if (spread > 0.4) return null;
  const weeks = gap < 63;
  const interval = Math.max(1, Math.round(weeks ? gap / 7 : gap / 30.4));
  const unit = weeks ? "weeks" : "months";
  return {
    key: group.key, bankKey: group.key, kind: "rolling",
    name: tidyName(last.name), direction: last.direction, amount: Math.round(avg * 100) / 100,
    variance: Math.min(100, Math.ceil((spread * 100) / 5) * 5), category, icon,
    count: list.length, first: list[0].date, last: last.date, due: last.date,
    next: iso(addDays(parseIso(last.date), Math.round(gap))), debit: false, learnedDays: Math.round(gap),
    schedule: { frequency: "rolling", interval, unit }, tolerance: 0, certainty: "wahrscheinlich",
  };
}

export { CSV_COLUMNS, splitCsv, parseCsvDate, parseBankCsv, dropOwnTransfers, BANK_FIELDS, BANK_ALIASES, normCell, isOutbankCsv, decodeBankBytes, detectDelimiter, bankColumns, DATE_PATTERNS, detectDateFormat, parseDateAs, detectDecimal, parseMoneyCell, parseSepaTags, ruleCategory, needsMapping, guessBankLayout, IBAN_RE, CREDITOR_RE, MONEY_RE, columnFit, suggestColumns, guessHeaderRow, bankSignature, parseGenericCsv, xmlKids, xmlPath, xmlText, parseCamt, isCamt, MAX_BANK_BYTES, MAX_ZIP_FILES, tooBig, inflateCapped, unzipBankFiles, readZip, readBankSources, parseBankSource, LEGAL_FORMS, nameKey, tidyName, CSV_CATEGORY_RULES, csvCategory, CSV_RHYTHMS, daysBetween, median, commonWeekday, nthWeekday, nextDue, CARD_PAYMENT, CARD_SETTLEMENT, isCardSettlement, RARE_WORDS, GENERIC_WORDS, wordsOf, similarity, bestItem, analyzeBank, bankKeyOf, settlementSuggestion, matchItem, recurringSuggestion, rareSuggestion, rollingSuggestion };
