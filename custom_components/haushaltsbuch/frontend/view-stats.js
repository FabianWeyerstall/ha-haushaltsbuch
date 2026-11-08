/* Haushaltsbuch panel – Tab „Statistik“: saved bank transactions by month/year/category, insights, assigning transactions.
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { tr, fmtDate, monthName, shortDay, shortDate, esc, iso, parseIso, addDays } from "./format.js";
import { nameKey, csvCategory, daysBetween, median, CARD_PAYMENT, isCardSettlement, wordsOf, bestItem, recurringSuggestion } from "./bank-import.js";
import { scheduleLabel, monthlyEquivalent } from "./schedule.js";

export class StatsView {
  /**
   * The saved transactions as the statistics use them: credit card bills that
   * reached an imported card account are transfers and drop out; the others get
   * their own category instead of e.g. "bank fees". `index` maps each row to
   * its position in the saved ledger.
   */
  _cleanLedger() {
    const raw = this._ledger?.rows || [];
    if (this._ledgerClean?.raw === raw) return this._ledgerClean;
    const accounts = new Set(raw.map((r) => r[5]).filter(Boolean));
    const bills = raw.filter((r) => r[1] < 0 && isCardSettlement(r[2], r[6]));
    const drop = new Set();
    if (accounts.size > 1) {
      for (const out of bills) {
        const twin = raw.find((b) => b[1] > 0 && !drop.has(b) && b[5] !== out[5] && Math.abs(b[1] + out[1]) < 0.005 && Math.abs(daysBetween(out[0], b[0])) <= 10);
        if (twin) drop.add(out).add(twin);
      }
    }
    const billSet = new Set(bills);
    const index = new Map();
    const rows = [];
    raw.forEach((r, i) => {
      if (drop.has(r)) return;
      let row = r;
      if (billSet.has(r)) {
        row = [r[0], r[1], r[2], tr("Kreditkarte", "Credit card"), tr("Kreditkarten-Abrechnung", "Card statement"), r[5], r[6]];
        row.cardBill = true;
      }
      index.set(row, i);
      rows.push(row);
    });
    this._ledgerClean = { raw, rows, index, transfers: drop.size / 2, bills: bills.length - drop.size / 2 };
    return this._ledgerClean;
  }

  /**
   * Which month a transaction belongs to. With a salary month (payday to payday,
   * see _salaryItem) the months follow the paydays found in the transactions,
   * like the rest of the app: a payday after the 15th starts the next month.
   * Without one, or before the first payday found, it is the calendar month.
   */
  _statsMonthOf(rows) {
    const calendar = (d) => d.slice(0, 7);
    const salary = this._salaryItem();
    if (!salary) return { monthOf: calendar, startOf: () => null };
    const h = this._bankHistory?.[salary.id] || {};
    const booked = new Set((h.booked || []).map(([d, a]) => `${d}|${Number(a).toFixed(2)}`));
    const keys = new Set((h.bank_keys || []).filter((k) => k.startsWith("n:")));
    const least = Math.abs(salary.current_amount ?? salary.amount ?? 0) * 0.5;
    const paydays = [...new Set(rows
      .filter((r) => r[1] > 0 && r[1] >= least && (booked.has(`${r[0]}|${r[1].toFixed(2)}`) || keys.has(`n:${nameKey(r[2] || "")}|income`)))
      .map((r) => r[0]))].sort();
    if (!paydays.length) return { monthOf: calendar, startOf: () => null };
    const keyOf = (p) => (Number(p.slice(8)) > 15 ? iso(new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 1)).slice(0, 7) : p.slice(0, 7));
    const starts = new Map();
    for (const p of paydays) if (!starts.has(keyOf(p))) starts.set(keyOf(p), p);
    const monthOf = (d) => {
      let lo = 0, hi = paydays.length - 1, found = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (paydays[mid] <= d) { found = mid; lo = mid + 1; } else hi = mid - 1; }
      // Before the first payday, or long after the last one: calendar month.
      if (found < 0 || daysBetween(paydays[found], d) > 40) return calendar(d);
      return keyOf(paydays[found]);
    };
    return { monthOf, startOf: (key) => starts.get(key) || null };
  }

  /**
   * The category a transaction counts under in the statistics, newest wish first:
   * a category picked by hand ("only a category"), then the category of the entry
   * or budget it is assigned to (sub category = the entry), then the bank's own.
   * Returns { main, sub, item, manual }.
   */
  _statsCategories() {
    const items = this._state.items;
    const history = this._bankHistory || {};
    const manual = this._state.user.settings?.stats_categories || {};
    const cacheKey = [this._ledger?.rows, items, history, manual];
    if (this._statsCatCache && this._statsCatCache.key.every((k, i) => k === cacheKey[i])) return this._statsCatCache.of;
    const byId = new Map(items.map((i) => [i.id, i]));
    const byBooking = new Map();
    const byPayee = new Map();
    for (const [id, h] of Object.entries(history)) {
      const item = byId.get(id);
      if (!item) continue;
      for (const [date, amount] of [...(h.spendings || []), ...(h.booked || [])]) if (amount != null) byBooking.set(`${date}|${Number(amount).toFixed(2)}`, item);
      for (const k of h.bank_keys || []) if (k.startsWith("n:")) byPayee.set(k, item);
    }
    const none = tr("Ohne Kategorie", "Uncategorised");
    const cache = new WeakMap();
    const of = (r) => {
      if (cache.has(r)) return cache.get(r);
      const payee = `n:${nameKey(r[2] || "")}|${r[1] < 0 ? "expense" : "income"}`;
      const own = manual[this._statsRowKey(r)] || manual[payee];
      const bank = r[3] || r[4] || "";
      let result;
      if (own) result = { main: own, sub: r[4] && r[4] !== own ? r[4] : bank && bank !== own ? bank : own, manual: true };
      else {
        const item = r.cardBill ? null : byBooking.get(`${r[0]}|${Math.abs(r[1]).toFixed(2)}`) || byPayee.get(payee);
        result = item?.category ? { main: item.category, sub: item.name, item } : { main: bank || none, sub: r[4] || bank || none };
      }
      cache.set(r, result);
      return result;
    };
    this._statsCatCache = { key: cacheKey, of };
    return of;
  }

  /** Key of one single transaction for a category picked by hand. */
  _statsRowKey(r) {
    return `r:${r[0]}|${Math.abs(r[1]).toFixed(2)}|${nameKey(r[2] || "")}`;
  }

  _renderStats() {
    const clean = this._cleanLedger();
    const rows = clean.rows;
    if (!rows.length) {
      return `<div class="card empty">${tr("Noch keine Umsätze gespeichert. Importiere unter „Posten“ → „Importieren“ eine oder mehrere CSV-Dateien aus deiner Banking-App und lass „Umsätze für die Statistik speichern“ angehakt.", "No transactions saved yet. Import one or more CSV files from your banking app under “Entries” → “Import” and keep “Save transactions for statistics” ticked.")}</div>`;
    }
    const accounts = [...new Set(rows.map((r) => r[5]).filter(Boolean))].sort();
    const account = accounts.includes(this._statsAccount) ? this._statsAccount : "all";
    const mine = account === "all" ? rows : rows.filter((r) => r[5] === account);
    const years = [...new Set(mine.map((r) => r[0].slice(0, 4)))].sort();
    const { monthOf, startOf } = this._statsMonthOf(mine);
    this._statsMonthKey = monthOf;
    const mk = (r) => monthOf(r[0]);
    const monthsAll = [...new Set(mine.map(mk))].sort();
    const year = this._statsYear === "all" || years.includes(this._statsYear) ? this._statsYear : years[years.length - 1];
    const all = year === "all";
    const lastDate = mine[mine.length - 1][0];
    const inYear = (r, y) => r[0].startsWith(y);
    const month = !all && monthsAll.includes(this._statsMonth) && this._statsMonth.slice(0, 4) === year ? this._statsMonth : null;
    const mode = all ? "all" : month ? "month" : "year";
    // A running year is compared with the same part of the year before.
    const running = mode === "year" ? year === lastDate.slice(0, 4) : mode === "month" && month === monthOf(lastDate);
    const cutoff = running ? lastDate.slice(5) : "12-31";
    const prevYear = String(Number(year) - 1);
    const period = all ? mine : mine.filter((r) => (month ? mk(r) === month : inYear(r, year)));
    const before = all || !years.includes(prevYear) ? null : month ? mine.filter((r) => mk(r) === `${prevYear}-${month.slice(5)}` && (!running || r[0] <= `${prevYear}-${lastDate.slice(5)}`)) : mine.filter((r) => inYear(r, prevYear) && r[0].slice(5) <= cutoff);
    const sums = (list) => list.reduce((s, r) => (r[1] > 0 ? (s.income += r[1]) : (s.expense -= r[1]), s), { income: 0, expense: 0 });
    const now = sums(period);
    const was = before && before.length ? sums(before) : null;
    const fullYears = years.filter((y) => y !== lastDate.slice(0, 4) && mine.some((r) => r[0] < `${y}-02-01` && r[0] >= `${y}-01-01`));
    const perYear = all ? Math.max(1, daysBetween(mine[0][0], lastDate) / 365.25) : 1;
    const pctOf = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
    const badge = (pct, goodWhenUp, suffix = "") => {
      if (pct === null || !Number.isFinite(pct)) return "";
      const cls = pct === 0 ? "" : pct > 0 === goodWhenUp ? "good" : "bad";
      return `<span class="badge ${cls}">${pct > 0 ? "▲ " : pct < 0 ? "▼ " : ""}${Math.abs(pct)} %${suffix}</span>`;
    };
    const monthLabel = (key) => `${monthName(Number(key.slice(5)) - 1)} ${key.slice(0, 4)}`;
    const rest = now.income - now.expense;
    const insights = this._statsTab === "insights";

    // Where a transaction went: budget spending or confirmed booking of an entry.
    const indexOf = clean.index;
    const itemNames = Object.fromEntries(this._state.items.map((i) => [i.id, i.name]));
    const assignedTo = new Map();
    for (const [id, h] of Object.entries(this._bankHistory || {})) {
      for (const [date, amount] of [...(h.spendings || []), ...(h.booked || [])]) if (amount != null && itemNames[id]) assignedTo.set(`${date}|${Number(amount).toFixed(2)}`, itemNames[id]);
    }
    const keyOwner = new Map();
    for (const [id, h] of Object.entries(this._bankHistory || {})) for (const k of h.bank_keys || []) if (itemNames[id] && k.startsWith("n:")) keyOwner.set(k, itemNames[id]);
    const catOf = this._statsCategories();
    const assignChip = (r) => {
      const name = assignedTo.get(`${r[0]}|${Math.abs(r[1]).toFixed(2)}`) || keyOwner.get(`n:${nameKey(r[2] || "")}|${r[1] < 0 ? "expense" : "income"}`);
      const c = catOf(r);
      const label = c.manual ? `→ ${esc(c.main)}` : name ? `→ ${esc(name)}` : tr("zuordnen", "assign");
      return `<button class="assign-chip ${name || c.manual ? "set" : ""}" data-action="ledger-assign" data-row="${indexOf.get(r)}" data-current="${esc(name || "")}">${label}</button>`;
    };

    // Top: period, navigation, account, tabs.
    const steps = mode === "month" ? monthsAll : mode === "year" ? years : [];
    const at = steps.indexOf(mode === "month" ? month : year);
    const prev = at > 0 ? steps[at - 1] : null;
    const next = at >= 0 && at < steps.length - 1 ? steps[at + 1] : null;
    const navLabel = mode === "month" ? monthLabel(month) : mode === "year" ? year : tr(`seit ${years[0]}`, `since ${years[0]}`);
    const pill = (p, text) => `<button class="${mode === p ? "on" : ""}" data-action="stats-period" data-period="${p}">${text}</button>`;
    const top = `<div class="st-top">
        <div class="st-pills" role="tablist">${pill("month", tr("Monat", "Month"))}${pill("year", tr("Jahr", "Year"))}${pill("all", tr("Alle Jahre", "All years"))}</div>
        <div class="st-nav">
          ${mode === "all" ? "" : `<button class="st-arrow" ${prev ? `data-action="stats-step" data-to="${prev}"` : "disabled"} aria-label="${tr("zurück", "back")}">‹</button>`}
          <span>${esc(navLabel)}</span>
          ${mode === "all" ? "" : `<button class="st-arrow" ${next ? `data-action="stats-step" data-to="${next}"` : "disabled"} aria-label="${tr("weiter", "next")}">›</button>`}
        </div>
        ${accounts.length > 1 ? `<select class="st-chip" data-change="stats-account" aria-label="${tr("Konto", "Account")}">
          <option value="all">${tr("Alle Konten", "All accounts")}</option>
          ${accounts.map((a) => `<option value="${esc(a)}" ${a === account ? "selected" : ""}>${tr("Konto", "Account")} …${esc(a.slice(-4))}</option>`).join("")}
        </select>` : ""}
      </div>
      <div class="st-tabs" role="tablist">
        <button class="${insights ? "" : "on"}" data-action="stats-tab" data-tab="numbers">${tr("Zahlen", "Numbers")}</button>
        <button class="${insights ? "on" : ""}" data-action="stats-tab" data-tab="insights">${tr("Auswertungen", "Insights")}</button>
      </div>`;

    const manage = `<div class="card st-card"><div class="row-between"><p class="hint">${tr(`Gespeichert sind ${rows.length} Umsätze vom ${shortDate(rows[0][0])} bis ${shortDate(lastDate)}, nur in deinem Home Assistant und nur für dich sichtbar. Umbuchungen zwischen deinen Konten zählen nicht mit.`, `${rows.length} transactions from ${shortDate(rows[0][0])} to ${shortDate(lastDate)} are saved, only in your Home Assistant and only visible to you. Transfers between your accounts are not counted.`)}${clean.bills ? tr(` ${clean.bills === 1 ? "1 Kreditkarten-Abrechnung steht" : `${clean.bills} Kreditkarten-Abrechnungen stehen`} unter „Kreditkarte“. Importierst du auch die CSV der Kreditkarte, fallen sie als Umbuchung raus und du siehst die einzelnen Käufe.`, ` ${clean.bills} credit card bills are listed under “Credit card”. Import the card's CSV as well and they drop out as transfers, showing the single purchases instead.`) : ""}</p>
      <button class="secondary small" data-action="stats-clear">${tr("Alle löschen", "Delete all")}</button></div></div>`;
    const insightCards = this._renderInsights(mine, lastDate, year, all);
    if (insights) return top + `<div class="st-grid single">${insightCards}</div>` + manage;

    // Hero: what is left, with income and spending beside it.
    const monthStart = mode === "month" ? startOf(month) : null;
    const monthText = mode !== "month" ? "" : running ? tr(`Übrig im ${monthLabel(month)} bis ${shortDay(lastDate)}`, `Left over in ${monthLabel(month)} until ${shortDay(lastDate)}`) : tr(`Übrig im ${monthLabel(month)}`, `Left over in ${monthLabel(month)}`);
    const heroLabel = mode === "month" ? (monthStart ? (running ? tr(`Übrig im ${monthLabel(month)} · ${shortDay(monthStart)} bis ${shortDay(lastDate)}`, `Left over in ${monthLabel(month)} · ${shortDay(monthStart)} to ${shortDay(lastDate)}`) : `${monthText} · ${tr("ab", "from")} ${shortDay(monthStart)}`) : monthText)
      : mode === "year" ? (cutoff !== "12-31" ? tr(`Übrig ${year} bis ${shortDay(lastDate)}`, `Left over ${year} until ${shortDay(lastDate)}`) : tr(`Übrig ${year}`, `Left over ${year}`))
      : tr(`Übrig pro Jahr, Ø seit ${years[0]}`, `Left over per year, avg since ${years[0]}`);
    const vsLabel = mode === "month" ? `${monthName(Number(month.slice(5)) - 1)} ${prevYear}` : prevYear;
    const restDiff = was ? rest - (was.income - was.expense) : null;
    const share = now.income ? Math.round((rest / now.income) * 100) : null;
    // Small trend lines: the buckets around the chosen period.
    const sparkKeys = mode === "all" ? years : mode === "year" ? monthsAll.filter((m) => m.startsWith(year)) : monthsAll.slice(Math.max(0, monthsAll.indexOf(month) - 11), monthsAll.indexOf(month) + 1);
    const sparkSums = sparkKeys.map((k) => sums(mine.filter((r) => (k.length === 7 ? mk(r) === k : r[0].startsWith(k)))));
    const spark = (values, color) => {
      if (values.length < 2) return "";
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${hi === lo ? 15 : 27 - ((v - lo) / (hi - lo)) * 24}`).join(" ");
      return `<svg class="st-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/></svg>`;
    };
    const hero = `<div class="card st-card st-hero">
      <div>
        <div class="st-label">${esc(heroLabel)}</div>
        <div class="st-big-row"><span class="st-big ${rest < 0 ? "neg" : ""}">${this._money(rest / perYear)}</span>
          ${restDiff !== null && Math.abs(restDiff) >= 1 ? `<span class="badge ${restDiff > 0 ? "good" : "bad"}">${restDiff > 0 ? "▲" : "▼"} ${this._moneyPlain(Math.abs(restDiff))} ${tr(`ggü. ${vsLabel}`, `vs ${vsLabel}`)}</span>` : ""}</div>
        <div class="hint st-source">${tr(`Echte Umsätze aus deinen CSV-Importen, Stand ${shortDay(lastDate)}`, `Real transactions from your CSV imports, as of ${shortDay(lastDate)}.`)}${monthStart ? tr(" Der Monat läuft wie überall von Gehalt zu Gehalt.", " As everywhere, the month runs from payday to payday.") : ""}</div>
        <div class="hint">${share === null ? "" : rest >= 0 ? tr(`Du hast ${share} % deines Einkommens behalten.`, `You kept ${share} % of your income.`) : tr(`Du hast ${this._moneyPlain(-rest / perYear)} mehr ausgegeben als eingenommen.`, `You spent ${this._moneyPlain(-rest / perYear)} more than you earned.`)}</div>
      </div>
      ${share !== null && rest >= 0 ? `<div class="st-rate"><div class="st-rate-bar"><span style="width:${Math.max(0, Math.min(100, share))}%"></span></div><span class="hint">${tr(`Sparquote ${share} %`, `Savings rate ${share} %`)}</span></div>` : ""}
      <div class="st-kpis">
        <div class="st-kpi"><span class="st-label">${tr("Eingenommen", "Income")}</span><span class="st-kpi-v">${this._money(now.income / perYear)}</span>${was ? badge(pctOf(now.income, was.income), true) : ""}${spark(sparkSums.map((s) => s.income), "var(--success-color, #1baf7a)")}</div>
        <div class="st-kpi"><span class="st-label">${tr("Ausgegeben", "Spent")}</span><span class="st-kpi-v">${this._money(now.expense / perYear)}</span>${was ? badge(pctOf(now.expense, was.expense), false) : ""}${spark(sparkSums.map((s) => s.expense), "var(--error-color, #e34948)")}</div>
      </div>
    </div>`;

    // History: years, or the months of the year.
    const buckets = all ? years.map((y) => [y, y]) : Array.from({ length: 12 }, (_, i) => [`${year}-${String(i + 1).padStart(2, "0")}`, monthName(i, "short").slice(0, 3)]);
    const bucketSums = buckets.map(([key, name]) => ({ key, name, ...sums(mine.filter((r) => (all ? r[0].startsWith(key) : mk(r) === key))) }));
    const peak = Math.max(1, ...bucketSums.map((b) => Math.max(b.income, b.expense)));
    const magnitude = Math.pow(10, Math.floor(Math.log10(peak / 3)));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s * 3 >= peak) || magnitude * 10;
    const axisMax = step * Math.ceil(peak / step);
    const compact = new Intl.NumberFormat(this._numberLocale(), { notation: "compact", maximumFractionDigits: 1 });
    const W = 360;
    const H = 150;
    const T = 8;
    const left = 30;
    const slot = (W - left) / buckets.length;
    const barW = Math.max(3, Math.min(12, slot * 0.3));
    const selected = mode === "month" ? month : null;
    let chart = "";
    for (let v = 0; v <= axisMax + 0.1; v += step) {
      const y = T + H - (v / axisMax) * H;
      chart += `<line x1="${left}" x2="${W}" y1="${y}" y2="${y}" class="st-grid-line"/><text x="0" y="${y + 4}" class="st-axis">${v ? compact.format(v) : "0"}</text>`;
    }
    const bar = (x, value, cls) => {
      const h = (value / axisMax) * H;
      if (h <= 0) return "";
      const r = Math.min(barW / 2, 4, h);
      return `<path class="${cls}" d="M${x},${T + H} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z"/>`;
    };
    bucketSums.forEach((b, i) => {
      const x = left + i * slot + (slot - (2 * barW + 2)) / 2;
      const on = b.key === selected;
      const dim = selected && !on;
      const target = all ? `data-action="stats-step" data-to="${b.key}"` : b.income || b.expense ? `data-action="stats-month" data-month="${b.key}"` : "";
      chart += `<g class="st-col ${on ? "on" : ""} ${dim ? "dim" : ""}" ${target}>
        ${on ? `<rect class="st-col-hl" x="${left + i * slot + 2}" y="${T}" width="${slot - 4}" height="${H}" rx="8"/>` : ""}
        <rect class="st-hit" x="${left + i * slot}" y="0" width="${slot}" height="${H + T + 22}"/>
        ${bar(x, b.income, "st-in")}${bar(x + barW + 2, b.expense, "st-out")}
        <text x="${left + i * slot + slot / 2}" y="${T + H + 16}" class="st-axis st-xl ${on ? "on" : ""}" text-anchor="middle">${esc(all ? `’${b.name.slice(2)}` : b.name)}</text>
        <title>${esc(all ? b.key : monthLabel(b.key))}: +${Math.round(b.income)} / −${Math.round(b.expense)}</title></g>`;
    });
    const sel = selected ? bucketSums.find((b) => b.key === selected) : null;
    const history = `<div class="card st-card">
      <div class="st-head"><h3>${all ? tr("Verlauf pro Jahr", "By year") : tr(`Monatsverlauf ${year}`, `${year} by month`)}</h3>
        <div class="st-legend"><span style="--c:var(--success-color, #1baf7a)">${tr("ein", "in")}</span><span style="--c:var(--error-color, #e34948)">${tr("aus", "out")}</span></div></div>
      <svg class="st-chart" viewBox="0 0 ${W} ${T + H + 24}" role="img" aria-label="${tr("Einnahmen und Ausgaben", "Income and spending")}">${chart}</svg>
      ${sel ? `<div class="st-sel"><b>${esc(monthLabel(sel.key))}</b><span class="pos">+${this._moneyPlain(sel.income)}</span><span class="neg">−${this._moneyPlain(sel.expense)}</span><span>= ${this._moneyPlain(sel.income - sel.expense)} ${tr("übrig", "left")}</span></div>` : ""}
      <p class="hint">${all ? tr("Tippe auf ein Jahr für seine Monate.", "Tap a year for its months.") : mode === "month" ? tr("Gewählten Monat nochmal antippen zeigt das ganze Jahr.", "Tap the chosen month again for the whole year.") : tr("Tippe auf einen Monat für seine Umsätze.", "Tap a month for its transactions.")}</p>
    </div>`;

    // Categories: ring + list, each with sub categories, payees and bookings.
    const group = (list) => {
      const map = new Map();
      for (const r of list) {
        if (r[1] >= 0) continue;
        const { main, sub, item } = catOf(r);
        if (!map.has(main)) map.set(main, { name: main, total: 0, subs: new Map(), payees: new Map(), entries: 0 });
        const g = map.get(main);
        g.total -= r[1];
        if (item) g.entries -= r[1];
        g.subs.set(sub, (g.subs.get(sub) || 0) - r[1]);
        const payee = r[2] || "?";
        g.payees.set(payee, (g.payees.get(payee) || 0) - r[1]);
      }
      return map;
    };
    const cats = [...group(period).values()].sort((a, b) => b.total - a.total);
    const prevCats = before ? group(before) : null;
    const firstFull = fullYears[0];
    const lastFull = fullYears[fullYears.length - 1];
    const trendCats = all && firstFull && lastFull && firstFull !== lastFull ? [group(mine.filter((r) => inYear(r, firstFull))), group(mine.filter((r) => inYear(r, lastFull)))] : null;
    const colorOf = new Map(cats.map((c, i) => [c.name, i < 6 ? `var(--viz-${i + 1})` : "var(--viz-other)"]));
    const totalOut = cats.reduce((a, c) => a + c.total, 0);
    const slices = [...cats.slice(0, 6), ...(cats.length > 6 ? [{ name: "", total: cats.slice(6).reduce((a, c) => a + c.total, 0), other: true }] : [])];
    let ring = "";
    let a0 = -Math.PI / 2;
    const R = 58;
    const r0 = 41;
    for (const s of slices) {
      if (!s.total) continue;
      const a1 = a0 + (s.total / totalOut) * 2 * Math.PI;
      const gap = slices.length > 1 ? 0.03 : 0;
      const s0 = a0 + gap / 2;
      const s1 = Math.max(s0 + 0.001, a1 - gap / 2);
      const p = (a, rr) => `${(66 + rr * Math.cos(a)).toFixed(2)},${(66 + rr * Math.sin(a)).toFixed(2)}`;
      const large = s1 - s0 > Math.PI ? 1 : 0;
      ring += slices.length === 1
        ? `<circle cx="66" cy="66" r="${(R + r0) / 2}" fill="none" stroke="${s.other ? "var(--viz-other)" : colorOf.get(s.name)}" stroke-width="${R - r0}"/>`
        : `<path d="M${p(s0, R)} A${R},${R} 0 ${large} 1 ${p(s1, R)} L${p(s1, r0)} A${r0},${r0} 0 ${large} 0 ${p(s0, r0)} Z" fill="${s.other ? "var(--viz-other)" : colorOf.get(s.name)}"/>`;
      a0 = a1;
    }
    // Whole euros keep the centre readable; long sums get a smaller font so they stay inside the ring.
    const ringText = `${new Intl.NumberFormat(this._numberLocale(), { maximumFractionDigits: 0 }).format(totalOut / perYear)} ${this._state.currency === "EUR" ? "€" : this._state.currency}`;
    const ringSize = ringText.length > 10 ? 11 : ringText.length > 8 ? 13 : 15;
    ring += `<text x="66" y="61" text-anchor="middle" class="st-ring-l">${all ? tr("Ø JAHR", "AVG YEAR") : tr("GESAMT", "TOTAL")}</text><text x="66" y="79" text-anchor="middle" class="st-ring-v" style="font-size:${ringSize}px">${esc(ringText)}</text>`;
    const catRows = cats.map((c) => {
      const open = this._statsOpen === c.name;
      let side = "";
      if (trendCats) {
        const a = trendCats[0].get(c.name)?.total || 0;
        const b = trendCats[1].get(c.name)?.total || 0;
        side = a && b ? badge(pctOf(b, a), false) : "";
      } else if (prevCats) side = badge(pctOf(c.total, prevCats.get(c.name)?.total || 0), false);
      const pick = open ? this._statsPick : null;
      const list = (map, kind) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, v]) => {
        const active = pick?.kind === kind && pick.name === n;
        return `<button class="stats-sub ${active ? "active" : ""}" data-action="stats-pick" data-kind="${kind}" data-name="${esc(n)}"><span>${esc(n)}</span><span>${this._moneyPlain(v / perYear)}</span></button>`;
      }).join("");
      let bookingsList = "";
      if (pick) {
        const hits = period
          .filter((r) => r[1] < 0 && catOf(r).main === c.name && (pick.kind === "sub" ? catOf(r).sub === pick.name : (r[2] || "?") === pick.name))
          .sort((a, b) => b[0].localeCompare(a[0]));
        const shown = hits.slice(0, this._statsMore ? hits.length : 40);
        const sum = hits.reduce((t, r) => t - r[1], 0);
        bookingsList = `<div class="stats-bookings">
          <div class="row-between"><h4>${esc(pick.name)} · ${hits.length === 1 ? tr("1 Buchung", "1 booking") : tr(`${hits.length} Buchungen`, `${hits.length} bookings`)}</h4><span>${this._moneyPlain(sum)}</span></div>
          <ul>${shown.map((r) => `<li><div class="csv-detail-head"><span>${shortDate(r[0])}</span><b>${this._moneyPlain(r[1])}</b>${pick.kind === "payee" ? (r[4] ? `<span class="what">${esc(r[4])}</span>` : "") : `<span class="what">${esc(r[2] || "")}</span>`}</div><div class="csv-detail-text assign-line"><span>${esc((r[6] || "").slice(0, 100))}</span>${assignChip(r)}</div></li>`).join("")}</ul>
          ${hits.length > shown.length ? `<button class="link" data-action="stats-more">${tr(`alle ${hits.length} anzeigen`, `show all ${hits.length}`)}</button>` : ""}
        </div>`;
      }
      return `<div class="st-cat ${open ? "open" : ""}">
        <button class="st-cat-row" data-action="stats-cat" data-cat="${esc(c.name)}" aria-expanded="${open}">
          <span class="st-dot" style="--c:${colorOf.get(c.name)}"></span>
          <span class="st-cat-n">${esc(c.name)}</span>
          <span class="st-cat-a">${this._moneyPlain(c.total / perYear)}</span>
          <span class="st-cat-d">${side}</span>
        </button>
        ${open ? `<div class="stats-detail"><div><h4>${c.entries >= c.total / 2 ? tr("Posten und Unterkategorien", "Entries and sub categories") : tr("Unterkategorien", "Sub categories")}</h4>${list(c.subs, "sub")}</div><div><h4>${tr("Größte Empfänger", "Biggest payees")}</h4>${list(c.payees, "payee")}</div></div>${bookingsList}` : ""}
      </div>`;
    }).join("");
    const categories = `<div class="card st-card">
      <div class="st-head"><h3>${tr("Ausgaben nach Kategorie", "Spending by category")}</h3><span class="hint">${trendCats ? `${firstFull} → ${lastFull}` : prevCats ? tr(`ggü. ${vsLabel}`, `vs ${vsLabel}`) : ""}</span></div>
      ${cats.length ? `<div class="st-donut"><svg viewBox="0 0 132 132" role="img" aria-label="${tr("Anteile der Kategorien", "Category shares")}">${ring}</svg><div class="st-cats">${catRows}</div></div>
      <p class="hint">${tr("Zugeordnete Umsätze zählen zur Kategorie ihres Postens oder Budgets, die übrigen zur Kategorie der Bank. Antippen zeigt Unterkategorien und Empfänger, darin ein Eintrag die einzelnen Buchungen. Über „zuordnen“ gibst du einem Umsatz einen Posten oder nur eine Kategorie.", "Assigned transactions count under the category of their entry or budget, the others under the bank's category. Tap for sub categories and payees, then an entry for its bookings. Use “assign” to give a transaction an entry or just a category.")}</p>` : `<p class="hint">${tr("Keine Ausgaben in diesem Zeitraum.", "No spending in this period.")}</p>`}
    </div>`;

    // At a glance: the insights in one line each.
    const glance = `<div class="card st-card">
      <div class="st-head"><h3>${tr("Auf einen Blick", "At a glance")}</h3><button class="link" data-action="stats-tab" data-tab="insights">${tr("alle Auswertungen ›", "all insights ›")}</button></div>
      <div class="st-tiles">${(this._insightTiles || []).map((t) => `<button class="st-tile" style="--c:var(--viz-${t.color})" data-action="stats-tab" data-tab="insights">
          <span class="st-tile-ic">${this._icon(t.icon, 18)}</span><span class="st-tile-t">${esc(t.title)}</span><span class="st-tile-v">${t.value}</span></button>`).join("")}</div>
    </div>`;

    // Transactions of the chosen month, by day.
    let txCard = "";
    if (mode === "month") {
      const byDay = new Map();
      for (const r of [...period].sort((a, b) => b[0].localeCompare(a[0]) || a[1] - b[1])) {
        if (!byDay.has(r[0])) byDay.set(r[0], []);
        byDay.get(r[0]).push(r);
      }
      txCard = `<div class="card st-card st-span">
        <div class="st-head"><h3>${tr(`Umsätze ${monthLabel(month)}`, `Transactions ${monthLabel(month)}`)}</h3><span class="hint">${period.length === 1 ? tr("1 Buchung", "1 booking") : tr(`${period.length} Buchungen`, `${period.length} bookings`)}</span></div>
        ${[...byDay.entries()].map(([day, list]) => `<div class="st-day">${esc(fmtDate(day, { weekday: "short", day: "numeric", month: "long" }))}</div>
          ${list.map((r) => {
            const cat = catOf(r).main;
            const c = r[1] > 0 ? "var(--success-color, #1baf7a)" : colorOf.get(cat) || "var(--viz-other)";
            return `<div class="st-tx"><span class="st-av" style="--c:${c}">${esc((r[2] || "?").trim().charAt(0).toUpperCase())}</span>
              <div class="st-tx-main"><div class="st-tx-n">${esc(r[2] || "?")}</div><div class="st-tx-m"><span>${esc(r[1] < 0 ? catOf(r).main : r[4] || r[3] || "")}</span>${assignChip(r)}</div>${r[6] ? `<div class="st-tx-p">${esc(r[6].slice(0, 90))}</div>` : ""}</div>
              <span class="st-tx-a ${r[1] > 0 ? "pos" : ""}">${r[1] > 0 ? "+" : ""}${this._moneyPlain(r[1])}</span></div>`;
          }).join("")}`).join("")}
      </div>`;
    }

    return top + `<div class="st-grid">${hero}${history}${categories}${glance}${txCard}</div>` + manage;
  }


  // ---------------------------------------------------------- insights

  /** Evaluations of the saved transactions that help keep the book complete and realistic. */
  _renderInsights(mine, lastDate, year, all) {
    const items = this._state.items;
    const history = this._bankHistory || {};
    const ignored = new Set(this._state.user.settings?.stats_ignored || []);
    const money = (v) => this._moneyPlain(v);
    const card = (title, hint, body) => `<div class="card insight"><h3>${title}</h3>${hint ? `<p class="hint">${hint}</p>` : ""}${body}</div>`;
    const empty = (text) => `<p class="hint">${text}</p>`;
    const assigned = new Map();
    for (const [id, h] of Object.entries(history)) {
      for (const [date, amount] of [...(h.spendings || []), ...(h.booked || [])]) if (amount != null) assigned.set(`${date}|${Number(amount).toFixed(2)}`, id);
    }
    const byKey = new Map();
    for (const i of items) for (const k of history[i.id]?.bank_keys || []) byKey.set(k, i);
    const rowKey = (b) => `${b.date}|${Math.abs(b.amount).toFixed(2)}`;

    // Payees with their bookings, as the CSV import keys them without mandate.
    const groups = new Map();
    for (const r of mine) {
      if (r.cardBill) continue;
      const b = { date: r[0], amount: r[1], name: r[2] || "?", purpose: r[6] || "", category: r[4] || r[3] || "", main: r[3] || "", text: "", mandate: "", creditor: "", direction: r[1] < 0 ? "expense" : "income" };
      const key = `n:${nameKey(b.name)}|${b.direction}`;
      if (!groups.has(key)) groups.set(key, { key, list: [] });
      groups.get(key).list.push(b);
    }
    const recentFrom = iso(addDays(parseIso(lastDate), -730));
    const plainItems = items.filter((i) => !["budget", "once"].includes(i.schedule?.frequency));
    const regular = [];
    for (const g of groups.values()) {
      const list = g.list.sort((a, b) => a.date.localeCompare(b.date));
      if (list.every((b) => CARD_PAYMENT.test(b.purpose))) continue;
      const last = list[list.length - 1];
      const { category, icon } = csvCategory(last);
      const recent = list.filter((b) => b.date >= recentFrom);
      const now = recent.length >= 2 ? recurringSuggestion(g, recent, lastDate, category, icon) : null;
      const ever = list.length >= 3 ? recurringSuggestion(g, list, last.date, category, icon) : null;
      if (!now && !ever) continue;
      let item = byKey.get(g.key) || null;
      if (!item) for (const b of list) if (!item && assigned.get(rowKey(b))) item = items.find((i) => i.id === assigned.get(rowKey(b))) || null;
      if (!item && now) item = bestItem(plainItems, last.direction, last.name, last.purpose, category, now.amount, Number(now.due.slice(8)), recent.map((b) => Math.abs(b.amount))) || null;
      regular.push({ g, now, ever, item, last });
    }

    // 1. Regular debits that belong to no entry.
    const missing = regular.filter((x) => x.now && !x.item && x.last.direction === "expense" && !ignored.has(x.g.key))
      .sort((a, b) => monthlyEquivalent(b.now) - monthlyEquivalent(a.now));
    this._insightSuggestions = Object.fromEntries(missing.map((x) => [x.g.key, x.now]));
    const hidden = [...ignored].filter((key) => !key.startsWith("x:")).map((key) => ({ key, name: groups.get(key)?.list.slice(-1)[0]?.name || key.replace(/^n:/, "").replace(/\|expense$/, "") }));
    const hiddenBlock = hidden.length ? `<div class="insight-hidden"><button class="link" data-action="insight-show-ignored">${this._showIgnored ? tr("Ausgeblendete verbergen", "Hide them again") : tr(`${hidden.length} mit „Ist ok“ ausgeblendet · anzeigen`, `${hidden.length} marked “fine” · show`)}</button>
      ${this._showIgnored ? `<ul>${hidden.map((h) => `<li><span>${esc(h.name)}</span><button class="small secondary" data-action="insight-unignore" data-key="${esc(h.key)}">${tr("Wieder anzeigen", "Show again")}</button></li>`).join("")}</ul>` : ""}</div>` : "";
    const missingCard = card(
      tr("Vergessene Abos?", "Forgotten subscriptions?"),
      tr("Regelmäßige Abbuchungen der letzten zwei Jahre, die zu keinem deiner Posten gehören.", "Regular debits of the last two years that belong to none of your entries."),
      missing.length
        ? `<div class="insight-list">${missing.map(({ g, now }) => `<div class="insight-row">
            <div class="entry-icon">${this._icon(now.icon)}</div>
            <div class="entry-main"><div class="entry-name">${esc(now.name)}</div>
              <div class="entry-meta plain">${esc(scheduleLabel(now))} · ${now.count}× · ${tr("zuletzt", "last")} ${shortDate(now.last)}</div>
              <div class="insight-actions"><button class="small" data-action="insight-create" data-key="${esc(g.key)}">${tr("Als Posten anlegen", "Create entry")}</button><button class="small secondary" data-action="insight-ignore" data-key="${esc(g.key)}">${tr("Ist ok", "Fine")}</button></div>
            </div>
            <div class="entry-amount neg">${money(-now.amount)}</div></div>`).join("")}</div>`
        : empty(tr("Alles erfasst: Jede regelmäßige Abbuchung gehört zu einem Posten.", "All covered: every regular debit belongs to an entry.")),
    ).replace(/<\/div>$/, () => `${hiddenBlock}</div>`);

    // 2. How the price of regular payments developed over the years.
    // Payees assigned to the same entry (e.g. electricity from several providers
    // over the years) form one line.
    const priceGroups = new Map();
    for (const x of regular) {
      if (x.last.direction !== "expense") continue;
      const id = x.item && byKey.get(x.g.key) === x.item ? `i:${x.item.id}` : x.g.key;
      const pg = priceGroups.get(id) || { name: x.item && id.startsWith("i:") ? x.item.name : x.item?.name || (x.now || x.ever).name, list: [], payees: new Set() };
      pg.list.push(...x.g.list);
      pg.payees.add(x.last.name);
      priceGroups.set(id, pg);
    }
    const prices = [];
    for (const pg of priceGroups.values()) {
      pg.list.sort((a, b) => a.date.localeCompare(b.date));
      if (daysBetween(pg.list[pg.list.length - 1].date, lastDate) > 400) continue;
      const perYear = {};
      // Each year against its own typical amount, so a cheaper former provider still counts.
      const byYear = {};
      for (const b of pg.list) (byYear[b.date.slice(0, 4)] ||= []).push(Math.abs(b.amount));
      for (const [y, list] of Object.entries(byYear)) {
        const typical = median(list);
        perYear[y] = list.filter((v) => Math.abs(v - typical) <= typical * 0.6);
      }
      const ys = Object.keys(perYear).sort();
      if (ys.length < 2) continue;
      const first = median(perYear[ys[0]]);
      const latest = median(perYear[ys[ys.length - 1]]);
      const pct = Math.round(((latest - first) / first) * 100);
      if (Math.abs(pct) < 3) continue;
      prices.push({ name: pg.name, payees: pg.payees.size, from: ys[0], to: ys[ys.length - 1], first, latest, pct, steps: ys.map((y) => [y, median(perYear[y])]) });
    }
    prices.sort((a, b) => Math.abs(b.latest - b.first) * 12 - Math.abs(a.latest - a.first) * 12);
    const priceCard = card(
      tr("Preisentwicklung deiner Verträge", "How your contracts got pricier"),
      tr("Typischer Betrag im ersten und im letzten Jahr. Antippen zeigt jedes Jahr.", "Typical amount in the first and the latest year. Tap for every year."),
      prices.length
        ? `<div class="insight-list">${prices.slice(0, 12).map((p) => `<details class="insight-price"><summary>
            <span class="entry-name">${esc(p.name)}</span>
            <span class="insight-change">${money(p.first)} → ${money(p.latest)} <span class="delta ${p.pct > 0 ? "neg" : "pos"}">${p.pct > 0 ? "+" : ""}${p.pct} %</span></span>
            <span class="hint">${p.from}–${p.to}${p.payees > 1 ? tr(` · ${p.payees} Anbieter`, ` · ${p.payees} providers`) : ""}</span></summary>
            <div class="insight-steps">${p.steps.map(([y, v]) => `<span>${y}: ${money(v)}</span>`).join("")}</div></details>`).join("")}</div>`
        : empty(tr("Keine Preisänderungen bei laufenden Verträgen gefunden.", "No price changes found in running contracts.")),
    );

    // 3. Budgets compared with the real spending of the last 12 months.
    const yearAgo = iso(addDays(parseIso(lastDate), -365));
    const budgets = items.filter((i) => i.schedule?.frequency === "budget");
    const stemsOf = (text) => wordsOf(text).map((w) => w.slice(0, Math.max(4, w.length - 2)));
    const rowIndex = this._cleanLedger().index;
    const exKey = (budgetId, date, amount, name) => `x:${budgetId}|${date}|${amount.toFixed(2)}|${nameKey(name).slice(0, 40)}`;
    const budgetRows = budgets.map((budget) => {
      const stems = stemsOf(budget.name);
      const keys = new Set(history[budget.id]?.bank_keys || []);
      const generic = budget.name.toLowerCase() === String(budget.category).toLowerCase();
      const hits = mine.filter((r) => {
        if (r[1] >= 0 || r[0] < yearAgo) return false;
        const b = { date: r[0], amount: r[1], name: r[2] || "", purpose: r[6] || "", category: r[4] || r[3] || "" };
        const owner = assigned.get(rowKey(b));
        if (owner) return owner === budget.id;
        if (keys.has(`c:${b.category}`) || keys.has(`n:${nameKey(b.name)}|expense`)) return true;
        const words = wordsOf(`${b.category} ${b.name} ${b.purpose}`);
        if (stems.some((st) => words.some((w) => w.startsWith(st)))) return true;
        return generic && csvCategory(b).category === budget.category;
      }).map((r) => ({ date: r[0], amount: -r[1], name: r[2] || "?", row: rowIndex.get(r), key: exKey(budget.id, r[0], -r[1], r[2] || "?"), own: assigned.get(`${r[0]}|${Math.abs(r[1]).toFixed(2)}`) === budget.id }));
      // Payments the user took out of this budget by hand.
      const removed = hits.filter((h) => ignored.has(h.key));
      for (const h of removed) hits.splice(hits.indexOf(h), 1);
      // Spending entered in the app (e.g. cash) counts as well.
      const seen = new Set(hits.map((h) => `${h.date}|${h.amount.toFixed(2)}`));
      for (const [date, amount] of history[budget.id]?.spendings || []) {
        if (amount == null || date < yearAgo || date > lastDate || seen.has(`${date}|${Number(amount).toFixed(2)}`)) continue;
        hits.push({ date, amount: Number(amount), name: tr("in der App eingetragen", "entered in the app") });
      }
      hits.sort((a, b) => b.date.localeCompare(a.date));
      const from = mine[0][0] > yearAgo ? mine[0][0] : yearAgo;
      const monthKeys = [];
      for (let d = parseIso(`${from.slice(0, 7)}-01`); iso(d) <= lastDate; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) monthKeys.push(iso(d).slice(0, 7));
      // The running month is incomplete and would pull the numbers down.
      if (monthKeys.length > 1 && lastDate.slice(8) < "25") monthKeys.pop();
      const perMonth = Object.fromEntries(monthKeys.map((m) => [m, 0]));
      for (const h of hits) if (h.date.slice(0, 7) in perMonth) perMonth[h.date.slice(0, 7)] += h.amount;
      const values = Object.values(perMonth);
      const activeMonths = values.filter((v) => v > 0).length;
      const typical = values.length ? median(values) : 0;
      const peak = Math.max(0, ...values);
      const planned = Number(budget.current_amount ?? budget.amount) || 0;
      // Only propose when the payments clearly cover the budget: most months, enough payments.
      const enough = hits.length >= 6 && values.length >= 3 && activeMonths >= Math.ceil(values.length * 0.75);
      const proposal = Math.ceil(typical / 10) * 10;
      return { budget, hits, removed, count: hits.length, typical, peak, planned, enough, proposal, months: values.length, activeMonths, pot: planned === 0 };
    });
    const budgetCard = card(
      tr("Budgets aus echten Zahlen", "Budgets from real numbers"),
      tr("Was du in einem typischen Monat der letzten 12 Monate wirklich ausgegeben hast. Einzelne teure Monate verzerren das nicht. Ein Vorschlag kommt nur, wenn in fast jedem Monat Zahlungen zum Budget gefunden wurden.", "What you really spent in a typical month of the last 12 months. Single expensive months don't distort it. A proposal only appears when payments were found in almost every month."),
      budgets.length
        ? `<div class="insight-list">${budgetRows.map((x) => {
            const diff = x.planned ? Math.round(((x.typical - x.planned) / x.planned) * 100) : 0;
            const tone = diff > 10 ? "neg" : diff < -10 ? "pos" : "";
            let meta;
            if (x.pot) meta = x.count ? tr(`Sammeltopf · typisch ${this._moneyPlain(x.typical)} pro Monat · ${x.count} Zahlungen`, `Collection pot · typically ${this._moneyPlain(x.typical)} per month · ${x.count} payments`) : tr("Sammeltopf · keine passenden Umsätze gefunden", "Collection pot · no matching transactions found");
            else if (!x.count) meta = tr(`geplant ${this._moneyPlain(x.planned)} · keine passenden Umsätze gefunden`, `planned ${this._moneyPlain(x.planned)} · no matching transactions found`);
            else if (!x.enough) meta = tr(`geplant ${this._moneyPlain(x.planned)} · nur ${x.count === 1 ? "1 Zahlung" : `${x.count} Zahlungen`} in ${x.activeMonths} von ${x.months} Monaten erkannt, zu wenig für einen Vorschlag`, `planned ${this._moneyPlain(x.planned)} · only ${x.count} payments in ${x.activeMonths} of ${x.months} months found, too few for a proposal`);
            else meta = tr(`geplant ${this._moneyPlain(x.planned)} · typisch ${this._moneyPlain(x.typical)} pro Monat · teuerster Monat ${this._moneyPlain(x.peak)} · ${x.count} Zahlungen`, `planned ${this._moneyPlain(x.planned)} · typically ${this._moneyPlain(x.typical)} per month · most expensive month ${this._moneyPlain(x.peak)} · ${x.count} payments`);
            const propose = !x.pot && x.enough && x.budget.editable !== false && Math.abs(x.proposal - x.planned) >= Math.max(10, x.planned * 0.05);
            const shown = x.hits.slice(0, 30);
            return `<div class="insight-row">
              <div class="entry-icon">${this._icon(x.budget.icon)}</div>
              <div class="entry-main"><div class="entry-name">${esc(x.budget.name)}</div>
                <div class="entry-meta plain">${meta}</div>
                ${!x.pot && x.count && !x.enough ? `<p class="hint">${tr("Ordne unter „Zahlen“ weitere Umsätze diesem Budget zu, dann wird der Vorschlag genauer.", "Assign more transactions to this budget under “Numbers” to get a proposal.")}</p>` : ""}
                ${propose ? `<div class="insight-actions"><button class="small" data-action="insight-budget" data-id="${esc(x.budget.id)}" data-amount="${x.proposal}">${tr(`Budget auf ${this._moneyPlain(x.proposal)} setzen`, `Set budget to ${this._moneyPlain(x.proposal)}`)}</button></div>` : ""}
                ${x.count || x.removed.length ? `<details class="insight-hits" data-budget="${esc(x.budget.id)}" ${this._openHits === x.budget.id ? "open" : ""}><summary>${tr("gezählte Zahlungen ansehen", "show counted payments")}</summary>
                  <p class="hint">${tr("Passt eine Zahlung nicht: „raus“ nimmt sie aus dieser Rechnung, „zuordnen“ ordnet sie woanders hin.", "If a payment doesn't fit: “remove” takes it out of this calculation, “assign” moves it elsewhere.")}</p>
                  <ul>${shown.map((h) => `<li><span class="hit-main"><span>${shortDate(h.date)}</span> ${esc(h.name)}</span><b>${this._moneyPlain(h.amount)}</b>${h.row === undefined ? `<span class="hit-actions hint">${tr("in der App eingetragen", "entered in the app")}</span>` : `<span class="hit-actions"><button type="button" class="assign-chip" data-action="ledger-assign" data-row="${h.row}" data-current="${h.own ? esc(x.budget.name) : ""}">${tr("zuordnen", "assign")}</button><button type="button" class="assign-chip" data-action="budget-hit-remove" data-budget="${esc(x.budget.id)}" data-key="${esc(h.key)}">${tr("raus", "remove")}</button></span>`}</li>`).join("")}</ul>
                  ${x.hits.length > shown.length ? `<p class="hint">${tr(`und ${x.hits.length - shown.length} weitere`, `and ${x.hits.length - shown.length} more`)}</p>` : ""}
                  ${x.removed.length ? `<button type="button" class="link" data-action="budget-hit-restore" data-budget="${esc(x.budget.id)}">${tr(`${x.removed.length} rausgenommen · zurückholen`, `${x.removed.length} removed · restore`)}</button>` : ""}</details>` : ""}
              </div>
              ${!x.pot && x.enough ? `<div class="insight-badge ${tone}">${diff > 0 ? "+" : ""}${diff} %</div>` : ""}</div>`;
          }).join("")}</div>`
        : empty(tr("Du hast noch keine Budgets. Unter „Posten“ legst du eins an, z. B. für Lebensmittel.", "You have no budgets yet. Create one under “Entries”, e.g. for groceries.")),
    );

    // 4. Expensive months of the year and what to put aside for them.
    const years = [...new Set(mine.map((r) => r[0].slice(0, 4)))].sort();
    const fullYears = years.filter((y) => mine.some((r) => r[0].startsWith(`${y}-01`)) && mine.some((r) => r[0].startsWith(`${y}-12`)));
    let seasonCard;
    let seasonTile = null;
    if (fullYears.length) {
      const perMonth = Array.from({ length: 12 }, () => 0);
      for (const r of mine) if (r[1] < 0 && fullYears.includes(r[0].slice(0, 4))) perMonth[Number(r[0].slice(5, 7)) - 1] -= r[1];
      const avgMonth = perMonth.map((v) => v / fullYears.length);
      const mean = avgMonth.reduce((a, v) => a + v, 0) / 12;
      const top = Math.max(...avgMonth);
      const reserve = avgMonth.reduce((a, v) => a + Math.max(0, v - mean), 0) / 12;
      const expensive = avgMonth.map((v, i) => [i, v]).filter(([, v]) => v > mean * 1.1).sort((a, b) => b[1] - a[1]);
      if (expensive.length) seasonTile = { month: expensive[0][0], reserve: Math.ceil(reserve / 5) * 5 };
      seasonCard = card(
        tr("Teure Monate", "Expensive months"),
        tr(`Durchschnittliche Ausgaben je Monat aus ${fullYears.length === 1 ? `dem Jahr ${fullYears[0]}` : `${fullYears.length} vollen Jahren (${fullYears[0]}–${fullYears[fullYears.length - 1]})`}.`, `Average spending per month from ${fullYears.length === 1 ? fullYears[0] : `${fullYears.length} full years (${fullYears[0]}–${fullYears[fullYears.length - 1]})`}.`),
        `<div class="stats-columns season">${avgMonth.map((v, i) => `<div class="stats-col"><div class="stats-bars"><span class="bar-out ${v > mean * 1.1 ? "hot" : ""}" style="height:${(v / top) * 100}%"></span></div><span class="stats-col-label">${esc(monthName(i, "short"))}</span></div>`).join("")}</div>
        <p>${tr(`Im Schnitt gibst du <b>${this._moneyPlain(mean)}</b> pro Monat aus.`, `On average you spend <b>${this._moneyPlain(mean)}</b> per month.`)}
        ${expensive.length ? tr(` Teurer sind: ${expensive.map(([i, v]) => `${monthName(i)} (+${this._moneyPlain(v - mean)})`).join(", ")}.`, ` More expensive: ${expensive.map(([i, v]) => `${monthName(i)} (+${this._moneyPlain(v - mean)})`).join(", ")}.`) : ""}</p>
        ${reserve >= 5 ? `<p class="insight-tip">${tr(`Leg jeden Monat etwa <b>${this._moneyPlain(Math.ceil(reserve / 5) * 5)}</b> zurück, dann tun die teuren Monate nicht weh.`, `Put aside about <b>${this._moneyPlain(Math.ceil(reserve / 5) * 5)}</b> each month and the expensive months won't hurt.`)}</p>` : ""}`,
      );
    } else {
      seasonCard = card(tr("Teure Monate", "Expensive months"), "", empty(tr("Dafür braucht es mindestens ein volles Kalenderjahr an Umsätzen.", "This needs at least one full calendar year of transactions.")));
    }

    // 5. Year in review.
    const reviewYear = !all ? year : fullYears[fullYears.length - 1] || years[years.length - 1];
    const yearRows = mine.filter((r) => r[0].startsWith(reviewYear));
    const income = yearRows.filter((r) => r[1] > 0).reduce((a, r) => a + r[1], 0);
    const spent = yearRows.filter((r) => r[1] < 0).reduce((a, r) => a - r[1], 0);
    const monthsLeft = {};
    for (const r of yearRows) monthsLeft[r[0].slice(5, 7)] = (monthsLeft[r[0].slice(5, 7)] || 0) + r[1];
    const monthEntries = Object.entries(monthsLeft).sort((a, b) => b[1] - a[1]);
    // Rent and other regular payments would fill this list; only one-off expenses count.
    const regularKeys = new Set(regular.filter((x) => x.now || x.ever).map((x) => x.g.key));
    const biggest = yearRows.filter((r) => r[1] < 0 && !regularKeys.has(`n:${nameKey(r[2] || "?")}|expense`)).sort((a, b) => a[1] - b[1]).slice(0, 5);
    const payees = new Map();
    for (const r of yearRows) if (r[1] < 0) payees.set(r[2] || "?", (payees.get(r[2] || "?") || 0) - r[1]);
    const topPayees = [...payees.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const line = (left, right) => `<div class="stats-sub static"><span>${left}</span><span>${right}</span></div>`;
    const reviewCard = card(
      tr(`Jahresrückblick ${reviewYear}`, `${reviewYear} in review`),
      all ? tr("Das letzte volle Jahr. Wähle oben ein Jahr für einen anderen Rückblick.", "The latest full year. Pick a year above for another review.") : "",
      yearRows.length
        ? `<div class="totals">
            <div><div class="label">${tr("Eingenommen", "Income")}</div><div class="big pos">${this._money(income)}</div></div>
            <div><div class="label">${tr("Ausgegeben", "Spent")}</div><div class="big neg">${this._money(spent)}</div></div>
            <div><div class="label">${tr("Übrig", "Left over")}</div><div class="big">${this._money(income - spent)}</div>${income ? `<div class="hint">${tr(`${Math.round(((income - spent) / income) * 100)} % gespart`, `${Math.round(((income - spent) / income) * 100)} % saved`)}</div>` : ""}</div>
          </div>
          ${monthEntries.length > 1 ? `<p class="hint">${tr(`Bester Monat: ${monthName(Number(monthEntries[0][0]) - 1)} (${this._moneyPlain(monthEntries[0][1])} übrig) · knappster Monat: ${monthName(Number(monthEntries[monthEntries.length - 1][0]) - 1)} (${this._moneyPlain(monthEntries[monthEntries.length - 1][1])})`, `Best month: ${monthName(Number(monthEntries[0][0]) - 1)} (${this._moneyPlain(monthEntries[0][1])} left) · tightest month: ${monthName(Number(monthEntries[monthEntries.length - 1][0]) - 1)} (${this._moneyPlain(monthEntries[monthEntries.length - 1][1])})`)}</p>` : ""}
          <div class="stats-detail"><div><h4>${tr("Größte Einzelausgaben (ohne Regelmäßiges)", "Biggest one-off expenses")}</h4>${biggest.map((r) => line(`${shortDate(r[0])} ${esc(r[2] || "?")}`, money(-r[1]))).join("")}</div>
          <div><h4>${tr("Meistes Geld ging an", "Most money went to")}</h4>${topPayees.map(([n, v]) => line(esc(n), money(v))).join("")}</div></div>`
        : empty(tr("Für dieses Jahr sind keine Umsätze gespeichert.", "No transactions saved for this year.")),
    );

    // 6. Personal price increase per category between the first and the latest full year.
    let inflationCard;
    let inflationTile = null;
    if (fullYears.length >= 2) {
      const fy = fullYears[0];
      const ly = fullYears[fullYears.length - 1];
      const span = Number(ly) - Number(fy);
      const sumBy = (y) => {
        const m = new Map();
        for (const r of mine) if (r[1] < 0 && r[0].startsWith(y)) m.set(r[4] || r[3] || "?", (m.get(r[4] || r[3] || "?") || 0) - r[1]);
        return m;
      };
      const a = sumBy(fy);
      const b = sumBy(ly);
      const totalA = [...a.values()].reduce((s, v) => s + v, 0);
      const totalB = [...b.values()].reduce((s, v) => s + v, 0);
      const rows = [...b.entries()].filter(([c, v]) => (a.get(c) || 0) >= 120 && v >= 120).sort((x, y) => y[1] - x[1]).slice(0, 8)
        .map(([c, v]) => ({ c, before: a.get(c) / 12, now: v / 12 }));
      const rate = (x, y) => new Intl.NumberFormat(this._numberLocale(), { maximumFractionDigits: 1 }).format(Math.round((Math.pow(y / x, 1 / span) - 1) * 1000) / 10);
      const pct = (x, y) => Math.round(((y - x) / x) * 100);
      if (totalA && totalB) inflationTile = span > 1 ? tr(`${rate(totalA, totalB)} % pro Jahr`, `${rate(totalA, totalB)} % per year`) : `${pct(totalA, totalB) > 0 ? "+" : ""}${pct(totalA, totalB)} %`;
      inflationCard = card(
        tr("Dein persönlicher Preisanstieg", "Your personal price increase"),
        tr(`Ausgaben pro Monat ${fy} und ${ly}. Mehr kann auch heißen: mehr gekauft, nicht nur teurer.`, `Spending per month in ${fy} and ${ly}. More can also mean you bought more, not only higher prices.`),
        `<div class="insight-list">
          ${[{ c: tr("Alle Ausgaben", "All spending"), before: totalA / 12, now: totalB / 12, total: true }, ...rows].map((x) => `<div class="stats-sub static ${x.total ? "total" : ""}">
            <span>${esc(x.c)}</span>
            <span>${money(x.before)} → ${money(x.now)} <span class="delta ${x.now > x.before ? "neg" : "pos"}">${pct(x.before, x.now) > 0 ? "+" : ""}${pct(x.before, x.now)} %</span>${span > 1 ? ` <span class="hint">(${tr(`${rate(x.before, x.now)} % pro Jahr`, `${rate(x.before, x.now)} % per year`)})</span>` : ""}</span></div>`).join("")}
        </div>`,
      );
    } else {
      inflationCard = card(tr("Dein persönlicher Preisanstieg", "Your personal price increase"), "", empty(tr("Dafür braucht es mindestens zwei volle Kalenderjahre an Umsätzen.", "This needs at least two full calendar years of transactions.")));
    }

    // Short versions for the "at a glance" tiles.
    const missingSum = missing.reduce((a, x) => a + monthlyEquivalent(x.now), 0);
    const worst = budgetRows.filter((x) => !x.pot && x.enough && x.planned).map((x) => ({ x, d: Math.round(((x.typical - x.planned) / x.planned) * 100) })).sort((a, b) => b.d - a.d)[0];
    const topPrice = prices[0];
    this._insightTiles = [
      { icon: "mdi:magnify", color: 1, title: tr("Vergessene Abos", "Forgotten subscriptions"), value: missing.length ? tr(`${missing.length} · ${money(missingSum)}/Monat`, `${missing.length} · ${money(missingSum)}/month`) : tr("alles erfasst", "all covered") },
      { icon: "mdi:cart-outline", color: 2, title: tr("Budgets", "Budgets"), value: worst ? (worst.d > 10 ? `${esc(worst.x.budget.name)} +${worst.d} %` : worst.d < -10 ? tr(`${esc(worst.x.budget.name)} ${worst.d} %`, `${esc(worst.x.budget.name)} ${worst.d} %`) : tr("passen", "fit")) : tr("zu wenig Daten", "not enough data") },
      { icon: "mdi:trending-up", color: 3, title: tr("Preisentwicklung", "Price changes"), value: topPrice ? `${esc(topPrice.name)} ${topPrice.pct > 0 ? "+" : ""}${topPrice.pct} %` : tr("keine", "none") },
      { icon: "mdi:calendar-alert", color: 4, title: tr("Teurer Monat", "Expensive month"), value: seasonTile ? tr(`${monthName(seasonTile.month)} · ${money(seasonTile.reserve)} zurücklegen`, `${monthName(seasonTile.month)} · put aside ${money(seasonTile.reserve)}`) : "—" },
      { icon: "mdi:star-outline", color: 5, title: tr(`Rückblick ${reviewYear}`, `${reviewYear} review`), value: yearRows.length ? tr(`${money(income - spent)} übrig`, `${money(income - spent)} left`) : "—" },
      { icon: "mdi:chart-line", color: 6, title: tr("Dein Preisanstieg", "Your price increase"), value: inflationTile || "—" },
    ];

    return missingCard + budgetCard + priceCard + seasonCard + reviewCard + inflationCard;
  }

  /** The assign dialog with a sensible preselection and "remember" only for clear payees. */
  _assignDialog(r, current) {
    const direction = r[1] < 0 ? "expense" : "income";
    const key = `n:${nameKey(r[2] || "")}|${direction}`;
    const history = this._bankHistory || {};
    const items = this._state.items.filter((i) => i.direction === direction);
    let target = items.find((i) => (history[i.id]?.bank_keys || []).includes(key))?.id;
    if (!target) {
      const plain = items.filter((i) => !["budget", "once"].includes(i.schedule?.frequency));
      target = bestItem(plain, direction, r[2] || "", r[6] || "", r[4] || r[3] || "", Math.abs(r[1]), Number(r[0].slice(8)), [Math.abs(r[1])])?.id;
    }
    // A payee with transactions of different kinds (e.g. your own name on loan
    // payments and transfers) must not be assigned automatically next time.
    const same = (this._ledger?.rows || []).filter((x) => nameKey(x[2] || "") === nameKey(r[2] || "") && (x[1] < 0) === (r[1] < 0));
    const kinds = new Set(same.map((x) => x[4] || x[3] || ""));
    const mixed = kinds.size > 1 || !nameKey(r[2] || "");
    const manual = this._state.user.settings?.stats_categories || {};
    const own = manual[this._statsRowKey(r)] || manual[`${key}`];
    // A transaction with a category picked by hand opens on that choice again.
    if (own && !current) return { type: "assign", row: r, current, target: "category", mixed: !manual[key], category: own };
    return { type: "assign", row: r, current, target: target || "", mixed, category: "" };
  }

  _renderAssignForm(d) {
    const r = d.row;
    const direction = r[1] < 0 ? "expense" : "income";
    const items = this._state.items.filter((i) => i.direction === direction || (direction === "expense" && i.schedule?.frequency === "budget"));
    const budgets = direction === "expense" ? items.filter((i) => i.schedule?.frequency === "budget") : [];
    const regular = items.filter((i) => !["budget", "once"].includes(i.schedule?.frequency));
    const option = (i) => `<option value="${esc(i.id)}" ${d.target === i.id ? "selected" : ""}>${esc(i.name)}${i.editable === false ? ` (${esc(i.owner_name)})` : ""}</option>`;
    return `<form data-form="assign">
      <h2>${tr("Umsatz zuordnen", "Assign transaction")}</h2>
      <div class="assign-row"><b>${this._moneyPlain(r[1])}</b> · ${fmtDate(r[0])}<br>${esc(r[2] || "?")}<div class="hint">${esc([r[4] || r[3], r[6]].filter(Boolean).join(" · "))}</div></div>
      ${d.current ? `<p class="hint">${tr(`Schon zugeordnet zu „${esc(d.current)}“. Eine weitere Zuordnung kommt dazu, die alte bleibt. Falsche Budget-Ausgaben löschst du im Budget.`, `Already assigned to “${esc(d.current)}”. Another assignment is added; the old one stays. Remove wrong budget spendings in the budget.`)}</p>` : ""}
      <div class="grid">
        <label class="full">${tr("Gehört zu", "Belongs to")}<select name="target" required>
          <option value="" disabled ${d.target ? "" : "selected"}>${tr("Bitte wählen", "Please choose")}</option>
          ${budgets.length ? `<optgroup label="${tr("Budgets", "Budgets")}">${budgets.map(option).join("")}</optgroup>` : ""}
          ${regular.length ? `<optgroup label="${tr("Posten", "Entries")}">${regular.map(option).join("")}</optgroup>` : ""}
          <option value="once" ${d.target === "once" ? "selected" : ""}>${tr("Neuer einmaliger Posten", "New one-off entry")}</option>
          <option value="category" ${d.target === "category" ? "selected" : ""}>${tr("Nur Kategorie festlegen (ohne Posten)", "Only set a category (no entry)")}</option>
        </select></label>
        <label class="full">${tr("Name, falls neuer Posten", "Name, if new entry")}<input name="name" maxlength="80" value="${esc(r[2] || "")}"></label>
        <label class="full suggest-field">${tr("Kategorie, falls neuer Posten oder nur Kategorie", "Category, if new entry or only a category")}<input name="category" maxlength="60" autocomplete="off" placeholder="${esc(r[3] || r[4] || tr("Auswählen oder neue eingeben", "Pick one or type a new one"))}" value="${esc(d.category || "")}"><div class="suggest" hidden></div></label>
      </div>
      <label class="check"><input type="checkbox" name="remember" ${d.mixed ? "" : "checked"}> ${tr(`Alle Umsätze von „${esc(r[2] || "?")}“ gehören dazu, auch frühere und künftige`, `All transactions from “${esc(r[2] || "?")}” belong to it, past and future`)}</label>
      <p class="hint">${tr("So kannst du auch alte Anbieter dem heutigen Posten zuordnen, z. B. den früheren Stromanbieter dem Posten Strom. Die Preisentwicklung zeigt dann alles in einer Zeile.", "This also lets you assign old providers to today's entry, e.g. the former electricity provider to Electricity. Price changes then show everything in one line.")}</p>
      ${d.mixed ? `<p class="hint">${tr(`Von „${esc(r[2] || "?")}“ gibt es verschiedene Arten von Umsätzen. Deshalb ist das Häkchen aus.`, `“${esc(r[2] || "?")}” has different kinds of transactions, so this is off.`)}</p>` : ""}
      <p class="hint">${tr("Budget: wird als Ausgabe mit diesem Datum eingetragen. Posten: hakt den nächstgelegenen offenen Termin mit echtem Datum und Betrag ab. Nur Kategorie: für Käufe ohne Posten, die Statistik zählt sie dann unter dieser Kategorie. Leer lassen nimmt eine selbst gewählte Kategorie wieder weg.", "Budget: added as a spending on this date. Entry: confirms the nearest open date with the real date and amount. Only a category: for purchases without an entry; the statistics then count them under this category. Leave it empty to remove a category you picked.")}</p>
      ${this._error ? `<div class="error">${esc(this._error)}</div>` : ""}
      <div class="dialog-actions"><span></span><div>
        <button type="button" class="secondary" data-action="close">${tr("Abbrechen", "Cancel")}</button>
        <button type="submit">${tr("Zuordnen", "Assign")}</button>
      </div></div>
    </form>`;
  }
}
