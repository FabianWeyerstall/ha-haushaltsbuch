/* Haushaltsbuch panel – Import and export: JSON export/import, bank files, column dialog, matching dialog (calls bank-import.js).
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { tr, fmtDate, shortDate, esc, iso, parseIso, addDays, today } from "./format.js";
import { dropOwnTransfers, detectDateFormat, detectDecimal, MONEY_RE, columnFit, suggestColumns, guessHeaderRow, parseGenericCsv, readBankSources, parseBankSource, nameKey, tidyName, daysBetween, analyzeBank, bankKeyOf, matchItem } from "./bank-import.js";
import { scheduleLabel } from "./schedule.js";

export class ImportDialog {
  _renderImportForm(d) {
    const own = this._state.items.filter((i) => i.owner === this._state.user.id).length;
    return `<form data-form="import">
      <h2>${tr("Posten importieren", "Import entries")}</h2>
      <p>${tr(`Die Datei „${esc(d.fileName)}“ enthält <b>${d.data.items.length} Posten</b>`, `The file “${esc(d.fileName)}” contains <b>${d.data.items.length} entries</b>`)}${d.data.exported_at ? `, ${tr("exportiert am", "exported on")} ${fmtDate(d.data.exported_at.slice(0, 10))}` : ""}.</p>
      <label class="check option"><input type="radio" name="mode" value="add" checked> ${tr("Hinzufügen: Posten, die es schon gibt (gleicher Name, Betrag und Startdatum), werden übersprungen.", "Add: entries that already exist (same name, amount and start date) are skipped.")}</label>
      <label class="check option"><input type="radio" name="mode" value="replace"> ${tr(`Ersetzen: deine ${own} eigenen Posten werden vorher gelöscht, auch der Kontostand wird übernommen.`, `Replace: your ${own} own entries are deleted first, and the balance is taken over too.`)}</label>
      <p class="hint">${tr("Importierte Posten sind zunächst privat. Bestätigte Buchungen und festgelegte Termine werden mit übernommen.", "Imported entries start out private. Confirmed bookings and fixed dates are carried over.")}</p>
      <div class="dialog-actions"><span></span><div>
        <button type="button" class="secondary" data-action="close">${tr("Abbrechen", "Cancel")}</button>
        <button type="submit">${tr("Importieren", "Import")}</button>
      </div></div>
    </form>`;
  }

  _renderCsvForm(d) {
    const check = (s, change = "csv-check") => `<input type="checkbox" data-change="${change}" data-key="${esc(s.key)}" ${s.checked ? "checked" : ""}>`;
    const nameField = (s) => `<input class="csv-name" type="text" data-change="csv-name" data-key="${esc(s.key)}" value="${esc(s.name)}" aria-label="${tr("Name", "Name")}">`;
    const amount = (value, direction) => `<div class="entry-amount ${direction === "expense" ? "neg" : "pos"}">${this._money(direction === "expense" ? -value : value, true)}</div>`;
    const count = (n, one, many) => (n === 1 ? one : many.replace("#", n));

    const matchRow = (m) => {
      const budget = Boolean(m.spendings);
      const list = [...(m.bookings || [])].sort((x, y) => y.date.localeCompare(x.date));
      const last = list[0];
      const here = budget ? m.spendings.filter((p) => p.target === (m.rest ? "skip" : m.item.id)) : [];
      const elsewhere = budget ? m.spendings.length - here.length : 0;
      const meta = m.rest
        ? tr(`${count(m.spendings.length, "1 Zahlung", "# Zahlungen")} · ${m.spendings.length - elsewhere} nicht eingetragen`, `${count(m.spendings.length, "1 payment", "# payments")} · ${m.spendings.length - elsewhere} not added`)
        : budget
        ? tr(`${count(here.length, "1 Zahlung", "# Zahlungen")} hier eintragen${elsewhere ? ` · ${elsewhere} anders zugeordnet` : ""}`, `add ${count(here.length, "1 payment", "# payments")} here${elsewhere ? ` · ${elsewhere} assigned elsewhere` : ""}`)
        : m.confirmations.length
          ? tr(`${count(m.confirmations.length, "1 Termin", "# Termine")} abhaken`, `confirm ${count(m.confirmations.length, "1 date", "# dates")}`)
          : tr("nichts Offenes abzuhaken, nur die Zuordnung wird gemerkt", "nothing open to confirm, only the assignment is remembered");
      const learn = m.remembered || (budget && !m.bankKeys.length) ? "" : `<span class="chip shared">${tr("neu erkannt, wird gemerkt", "newly recognised, will be remembered")}</span>`;
      const price = m.priceChange
        ? `<label class="check csv-price">${check({ key: m.key, checked: m.priceChange.checked }, "csv-price")} ${tr(`Neuer Preis ab ${shortDate(m.priceChange.from)}: ${this._moneyPlain(m.priceChange.amount)} statt ${this._moneyPlain(m.priceChange.before)}`, `New price from ${shortDate(m.priceChange.from)}: ${this._moneyPlain(m.priceChange.amount)} instead of ${this._moneyPlain(m.priceChange.before)}`)}</label>`
        : "";
      const itemAmount = Number(m.item.current_amount ?? m.item.amount) || 0;
      const yours = m.rest
        ? tr("Passen zu keinem Budget und zählen nur in der Statistik. Du kannst sie unten einem Budget oder einem einmaligen Posten zuordnen.", "Fit no budget and only count in the statistics. Below you can assign them to a budget or a one-off entry.")
        : budget
        ? tr(`Dein Budget: ${this._moneyPlain(itemAmount)} pro Monat`, `Your budget: ${this._moneyPlain(itemAmount)} per month`)
        : tr(`Dein Posten: ${this._moneyPlain(itemAmount)} · ${esc(scheduleLabel(m.item))}`, `Your entry: ${this._moneyPlain(itemAmount)} · ${esc(scheduleLabel(m.item))}`);
      const bank = last
        ? tr(`Bank: „${esc(tidyName(last.name))}“ · ${count(list.length, "1 Buchung", "# Buchungen")} · zuletzt ${shortDate(last.date)} ${this._moneyPlain(Math.abs(last.amount))}`, `Bank: “${esc(tidyName(last.name))}” · ${count(list.length, "1 booking", "# bookings")} · last ${shortDate(last.date)} ${this._moneyPlain(Math.abs(last.amount))}`)
        : "";
      const confirmedOn = new Map((m.confirmations || []).map((c) => [`${c.actual_date}|${c.actual_amount}`, c.due_date]));
      const budgetOptions = d.items.filter((i) => i.schedule?.frequency === "budget");
      const spendLine = (p, index) => `<li><div class="csv-detail-head"><span>${shortDate(p.date)}</span><b>${this._moneyPlain(-p.amount)}</b>
          <select class="csv-spend" data-change="csv-spend" data-key="${esc(m.key)}" data-index="${index}" aria-label="${tr("Zuordnen", "Assign")}">
            ${budgetOptions.map((i) => `<option value="${esc(i.id)}" ${p.target === i.id ? "selected" : ""}>${tr("Budget", "Budget")} ${esc(i.name)}</option>`).join("")}
            <option value="once" ${p.target === "once" ? "selected" : ""}>${tr("einmaliger Posten", "one-off entry")}</option>
            <option value="skip" ${p.target === "skip" ? "selected" : ""}>${tr("nicht eintragen", "don't add")}</option>
          </select></div>
          <div class="csv-detail-text">${esc(p.note)}${m.bookings[index]?.purpose ? ` · ${esc(m.bookings[index].purpose.slice(0, 80))}` : ""}</div></li>`;
      const line = (b) => {
        const due = confirmedOn.get(`${b.date}|${Math.abs(b.amount)}`);
        const what = budget
          ? ""
          : due
            ? tr(`hakt Termin ${shortDate(due)} ab`, `confirms ${shortDate(due)}`)
            : b.date < m.item.start_date
              ? tr("vor Beginn deines Postens", "before your entry starts")
              : tr("schon abgehakt", "already confirmed");
        return `<li><div class="csv-detail-head"><span>${shortDate(b.date)}</span><b>${this._moneyPlain(b.amount)}</b>${what ? `<span class="what">${what}</span>` : ""}</div>
          <div class="csv-detail-text">${esc(tidyName(b.name))}${b.purpose ? ` · ${esc(b.purpose.slice(0, 80))}` : ""}</div></li>`;
      };
      const shown = list.slice(0, 6);
      const details = budget
        ? `<details class="csv-detail" data-key="${esc(m.key)}" ${m.open ? "open" : ""}><summary>${tr("Zahlungen ansehen und zuordnen", "Show and assign payments")}</summary><ul>${m.spendings.map(spendLine).join("")}</ul></details>`
        : list.length
        ? `<details class="csv-detail"><summary>${tr("Buchungen ansehen", "Show bookings")}</summary><ul>${shown.map(line).join("")}</ul>${list.length > shown.length ? `<div class="csv-detail-more">${tr(`und ${list.length - shown.length} ältere`, `and ${list.length - shown.length} older`)}</div>` : ""}</details>`
        : "";
      return `<div class="csv-row-wrap"><label class="csv-row">
          ${check(m)}
          <div class="entry-icon">${this._icon(m.item.icon)}</div>
          <div class="entry-main">
            <div class="entry-name">${esc(m.item.name)}</div>
            <div class="entry-meta plain">${yours}</div>
            ${bank && !budget ? `<div class="entry-meta plain">${bank}</div>` : ""}
            <div class="entry-meta">${meta} ${learn}</div>
          </div>
          ${budget && !m.rest ? amount(here.reduce((a, x) => a + x.amount, 0), "expense") : ""}
        </label>${price}${details}</div>`;
    };

    const own = (direction) => d.items.filter((i) => i.direction === direction && i.schedule?.frequency !== "budget");
    const newRow = (s) => {
      const meta = s.kind === "settlement"
        ? tr(`jedes Jahr um den ${fmtDate(s.last, { day: "2-digit", month: "2-digit" })} · gesehen ${s.years.join(", ")}${s.mixed ? " · mal Nachzahlung, mal Erstattung" : ""}`, `every year around ${fmtDate(s.last, { day: "2-digit", month: "2-digit" })} · seen ${s.years.join(", ")}${s.mixed ? " · sometimes back payment, sometimes refund" : ""}`)
        : s.kind === "rare"
        ? tr(`einmal gesehen am ${shortDate(s.last)} · jährlich? nächste etwa ${shortDate(s.next)}`, `seen once on ${shortDate(s.last)} · yearly? next around ${shortDate(s.next)}`)
        : s.kind === "rolling"
          ? tr(`gleitend, etwa alle ${s.learnedDays} Tage · ${s.count}× gebucht`, `rolling, about every ${s.learnedDays} days · booked ${s.count}×`)
          : `${esc(scheduleLabel(s))} · ${tr("nächste am", "next on")} ${shortDate(s.next)} · ${s.count}× ${s.debit ? tr("Lastschrift", "direct debit") : tr("gebucht", "booked")}${s.variance ? tr(` · schwankt bis ${s.variance} %`, ` · varies up to ${s.variance} %`) : ""}`;
      const step = s.priceStep ? `<span class="chip contract">${tr(`seit ${shortDate(s.priceStep.since)} ${this._moneyPlain(s.amount)} statt ${this._moneyPlain(s.priceStep.before)}`, `since ${shortDate(s.priceStep.since)} ${this._moneyPlain(s.amount)} instead of ${this._moneyPlain(s.priceStep.before)}`)}</span>` : "";
      const targets = own(s.direction);
      const target = targets.length
        ? `<select class="csv-target" data-change="csv-target" data-key="${esc(s.key)}" aria-label="${tr("Zuordnen", "Assign")}">
            <option value="new" ${s.target === "new" ? "selected" : ""}>${tr("als neuer Posten", "as a new entry")}</option>
            ${targets.map((i) => `<option value="${esc(i.id)}" ${s.target === i.id ? "selected" : ""}>${tr("gehört zu", "belongs to")}: ${esc(i.name)}</option>`).join("")}
          </select>`
        : "";
      return `<div class="csv-row-wrap"><label class="csv-row">
          ${check(s)}
          <div class="entry-icon">${this._icon(s.icon)}</div>
          <div class="entry-main">
            ${s.target === "new" ? nameField(s) : `<div class="entry-name">${esc(s.name)}</div>`}
            <div class="entry-meta">${meta} ${s.target === "new" ? this._chip(s.certainty) : ""} ${step}</div>
          </div>
          ${amount(s.amount, s.direction)}
        </label>${target}</div>`;
    };

    const budgetRow = (b) => `<div class="csv-row-wrap"><label class="csv-row">
        ${check(b)}
        <div class="entry-icon">${this._icon(b.icon)}</div>
        <div class="entry-main">
          ${nameField(b)}
          <div class="entry-meta">${tr(`Budget pro Monat · Durchschnitt aus ${b.count} Kartenzahlungen`, `monthly budget · average of ${b.count} card payments`)}</div>
        </div>
        ${amount(b.amount, "expense")}
      </label></div>`;

    const section = (title, hint, rows) => (rows ? `<h3 class="csv-sub">${title}</h3>${hint ? `<p class="hint">${hint}</p>` : ""}<div class="csv-list">${rows}</div>` : "");
    const picked = this._csvCounts(d);
    const nothing = !d.matches.length && !d.suggestions.length && !d.others.length && !d.budgets.length;
    return `<form data-form="csv">
      <h2>${tr("Umsätze abgleichen", "Compare transactions")}</h2>
      <p>${tr(`„${esc(d.fileName)}“: ${d.count} Umsätze vom ${shortDate(d.from)} bis ${shortDate(d.to)}`, `“${esc(d.fileName)}”: ${d.count} transactions from ${shortDate(d.from)} to ${shortDate(d.to)}`)}${d.accounts > 1 ? tr(` auf ${d.accounts} Konten`, ` in ${d.accounts} accounts`) : ""}.
        ${d.transfers ? tr(`${d.transfers} Umbuchungen zwischen deinen Konten zählen nicht mit.`, `${d.transfers} transfers between your accounts are left out.`) : ""}
        ${d.reread?.remap.length ? `<button type="button" class="link" data-action="csv-remap">${tr("Stimmt etwas nicht? Spalten selbst zuordnen", "Something wrong? Assign the columns yourself")}</button>` : ""}
        ${daysBetween(d.from, d.to) > 760 ? tr("Vorschläge kommen aus den letzten zwei Jahren, die ältere Historie hilft nur bei Jährlichem.", "Suggestions come from the last two years; older history only helps with yearly payments.") : ""}</p>
      <label class="check csv-ledger"><input type="checkbox" data-change="csv-ledger" ${d.saveLedger ? "checked" : ""}> ${tr(`Alle ${d.count} Umsätze für die Statistik speichern (nur in deinem Home Assistant, schon vorhandene werden übersprungen)`, `Save all ${d.count} transactions for statistics (only in your Home Assistant; existing ones are skipped)`)}</label>
      ${nothing ? `<p class="hint">${tr("Nichts Neues gefunden. Für gute Vorschläge sollte die Datei mindestens 6 bis 12 Monate abdecken.", "Nothing new found. For good suggestions the file should cover at least 6 to 12 months.")}</p>` : ""}
      ${section(tr("Passt zu deinen Posten", "Matches your entries"), tr("Gekommene Buchungen werden mit echtem Datum und Betrag abgehakt, Kartenzahlungen landen im passenden Budget.", "Bookings that arrived are confirmed with their real date and amount; card payments go into the matching budget."), d.matches.filter((m) => !m.rest).map(matchRow).join(""))}
      ${section(tr("Ohne Budget", "Without a budget"), "", d.matches.filter((m) => m.rest).map(matchRow).join(""))}
      ${section(tr("Neue regelmäßige Buchungen", "New regular payments"), "", d.suggestions.map(newRow).join(""))}
      ${section(tr("Selten oder unregelmäßig", "Rare or irregular"), tr("Nur einmal gesehen oder ohne festen Abstand. Gleitende Posten lernen den Abstand weiter, sobald du Termine bestätigst.", "Seen only once or without a fixed gap. Rolling entries keep learning the gap as you confirm dates."), d.others.map(newRow).join(""))}
      ${section(tr("Als Budget anlegen?", "Create as a budget?"), tr("Viele unregelmäßige Ausgaben derselben Kategorie. Die Kartenzahlungen dieses Monats werden gleich eingetragen.", "Many irregular expenses of the same category. This month's card payments are added right away."), d.budgets.map(budgetRow).join(""))}
      <p class="hint">${tr("Die Datei wird nur hier im Browser gelesen. Gespeichert wird nur, was angehakt ist. Das Haushaltsbuch merkt sich, welche Lastschrift zu welchem Posten gehört, und ordnet sie beim nächsten Import von selbst zu. Vorher wird automatisch eine Sicherung angelegt.", "The file is only read here in the browser. Only what is ticked is saved. The Household Budget remembers which direct debit belongs to which entry and assigns it by itself next time.")}</p>
      <div class="dialog-actions"><span></span><div>
        <button type="button" class="secondary" data-action="close">${tr("Abbrechen", "Cancel")}</button>
        <button type="submit" class="csv-submit" ${picked || d.saveLedger ? "" : "disabled"}>${this._csvSubmitLabel(picked, d.saveLedger)}</button>
      </div></div>
    </form>`;
  }

  _csvAll(d) {
    return [...d.matches, ...d.suggestions, ...d.others, ...d.budgets];
  }

  _csvCounts(d) {
    return this._csvAll(d).filter((s) => s.checked && !(s.rest && s.spendings.every((p) => p.target === "skip"))).length;
  }

  _csvSubmitLabel(n, ledger = false) {
    if (!n && ledger) return tr("Umsätze speichern", "Save transactions");
    return n === 1 ? tr("1 Vorschlag übernehmen", "Apply 1 suggestion") : tr(`${n} Vorschläge übernehmen`, `Apply ${n} suggestions`);
  }

  /** Save what is ticked: new entries first, then one sync with confirmations, spendings, keys and prices. */
  async _csvApply(d) {
    const monthStart = iso(new Date(today().getFullYear(), today().getMonth(), 1));
    const note = tr(`Aus Bank-CSV übernommen (${d.fileName})`, `Taken from bank CSV (${d.fileName})`);
    const fresh = [...d.suggestions, ...d.others].filter((s) => s.checked && s.target === "new");
    const budgets = d.budgets.filter((b) => b.checked);
    const items = [
      ...fresh.map((s) => ({
        name: s.name,
        direction: s.direction,
        amount: s.amount,
        amount_variance_pct: s.variance,
        date_tolerance_days: s.tolerance || 0,
        category: s.category,
        icon: s.icon,
        start_date: s.due,
        schedule: s.schedule,
        weekend_shift: s.category === "Gehalt" ? "previous" : null,
        note,
        bank_keys: [s.bankKey],
        confirmations: [{ due_date: s.due, status: "booked", actual_date: s.last, actual_amount: s.amount }],
      })),
      // Single card payments taken out of a budget as a one-off entry (e.g. car service).
      ...d.matches.filter((m) => m.checked && m.spendings).flatMap((m) => m.spendings.filter((p) => p.target === "once")).map((p) => ({
        name: p.note,
        direction: "expense",
        amount: p.amount,
        category: p.category,
        icon: "mdi:receipt-text",
        start_date: p.date,
        schedule: { frequency: "once", interval: 1 },
        note,
        confirmations: [{ due_date: p.date, status: "booked", actual_date: p.date, actual_amount: p.amount }],
      })),
      ...budgets.map((b) => ({ name: b.name, direction: "expense", amount: b.amount, category: b.category, icon: b.icon, start_date: monthStart, schedule: { frequency: "budget", interval: 1 }, note, bank_keys: [b.bankKey] })),
    ];
    // Safety net: everything can be put back under Household → Backups.
    await this._ws("backup/create", { reason: "csv_import" });
    const result = { added: 0, confirmed: 0, spendings: 0, price_changes: 0, ledger: 0 };
    if (d.saveLedger) {
      const rows = d.bookings.map((b) => ({ date: b.date, amount: b.amount, name: tidyName(b.name), main_category: b.main, category: b.category, account: b.account, purpose: b.purpose }));
      for (let i = 0; i < rows.length; i += 2000) result.ledger += (await this._ws("ledger/add", { rows: rows.slice(i, i + 2000) })).added;
    }
    if (items.length) result.added = (await this._ws("import", { data: { format: "haushaltsbuch", items }, replace: false })).added;

    const sync = { confirmations: [], spendings: [], keys: [], price_changes: [] };
    for (const m of d.matches.filter((x) => x.checked)) {
      if (m.spendings) {
        for (const p of m.spendings) if (p.target !== "skip" && p.target !== "once") sync.spendings.push({ item_id: p.target, date: p.date, amount: p.amount, note: p.note });
        for (const key of m.bankKeys) sync.keys.push({ item_id: m.item.id, key });
        continue;
      }
      sync.confirmations.push(...m.confirmations);
      if (!m.remembered) sync.keys.push({ item_id: m.item.id, key: m.bankKey });
    }
    for (const m of d.matches) if (m.priceChange?.checked) sync.price_changes.push({ item_id: m.item.id, from: m.priceChange.from, amount: m.priceChange.amount });
    // Assigned to an existing entry: remember the key and confirm its bookings.
    for (const s of [...d.suggestions, ...d.others].filter((x) => x.checked && x.target !== "new")) {
      const item = d.items.find((i) => i.id === s.target);
      sync.keys.push({ item_id: item.id, key: s.bankKey });
      sync.confirmations.push(...matchItem(item, d.bookingsByKey[s.key] || [], d.entries, d.history[item.id]).confirmations);
    }
    if (budgets.length) {
      const state = await this._ws("state");
      for (const b of budgets) {
        const item = state.items.find((i) => i.editable && i.name === b.name && i.schedule?.frequency === "budget");
        if (item) sync.spendings.push(...b.cardPayments.filter((p) => p.date >= item.start_date).map((p) => ({ item_id: item.id, date: p.date, amount: Math.abs(p.amount), note: tidyName(p.name) })));
      }
    }
    if (sync.confirmations.length || sync.spendings.length || sync.keys.length || sync.price_changes.length) {
      Object.assign(result, await this._ws("bank/sync", sync));
    }
    return result;
  }

  async _export() {
    try {
      const data = await this._ws("export");
      const name = `haushaltsbuch-${iso(today())}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          return;
        } catch (err) {
          if (err.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      this._error = this._errorText(err);
      this._render();
    }
  }

  /**
   * Read every file; a file whose columns are unclear opens the column dialog
   * first. `forced` holds profiles chosen in that dialog, by file index.
   */
  async _openBankSources(sources, forced = {}) {
    const profiles = this._state.user.settings?.csv_profiles || {};
    const parsed = [];
    for (const [index, source] of sources.entries()) {
      try {
        parsed.push(parseBankSource(source, profiles, forced[index] || null));
      } catch (err) {
        if (!err.needsMapping) throw err;
        this._openColumnDialog(sources, forced, index, err.info);
        return;
      }
    }
    // Banks without categories: what the user assigned before tells the category.
    const history = await this._ws("bank/history");
    const categoryOfKey = new Map();
    for (const item of this._state.items) for (const k of history[item.id]?.bank_keys || []) if (item.schedule?.frequency !== "budget") categoryOfKey.set(k, item.category);
    for (const p of parsed) {
      if (p.kind === "outbank") continue;
      for (const b of p.bookings) {
        const known = categoryOfKey.get(bankKeyOf(b)) || categoryOfKey.get(`n:${nameKey(b.name)}|${b.amount < 0 ? "expense" : "income"}`);
        if (known && !b.category) b.category = b.main = known;
        // Files without an account of their own count as one account each.
        if (!b.account && sources.length > 1) b.account = sources[parsed.indexOf(p)].name.replace(/\.[a-z]+$/i, "").slice(0, 40);
      }
    }
    const remap = parsed.map((p, i) => (p.kind === "csv" ? i : -1)).filter((i) => i >= 0);
    await this._openCsv(sources.map((x) => x.name), parsed.map((p) => p.bookings), { sources, forced, remap });
  }

  _openColumnDialog(sources, forced, index, info, manual = false) {
    const preview = info.rows.slice(0, 60);
    if (info.headerRow < 0 || !manual && !Object.keys(info.columns).length) info.headerRow = guessHeaderRow(info.rows);
    info.headerRow = Math.max(0, info.headerRow);
    const sample = info.rows.slice(info.headerRow + 1, info.headerRow + 41);
    if (!manual) {
      const dates = sample.map((r) => r[info.columns.date]);
      info.date = info.columns.date !== undefined ? detectDateFormat(dates) : detectDateFormat(sample.flat());
      info.decimal = detectDecimal(sample.flat().filter((v) => MONEY_RE.test(String(v).trim())));
    }
    const s = manual ? { columns: info.columns, suggested: new Set() } : suggestColumns(info.rows, info.headerRow, info.columns, info.date, info.decimal);
    info.columns = s.columns;
    if (!manual && s.suggested.has("date")) info.date = detectDateFormat(sample.map((r) => r[info.columns.date]));
    this._error = null;
    this._dialog = {
      type: "csv-map", sources, forced, index, rows: preview, headerRow: info.headerRow, columns: { ...info.columns },
      date: info.date, decimal: info.decimal, name: sources[index].name, total: info.rows.length, manual, suggested: [...s.suggested],
    };
    this._render();
  }

  _renderColumnForm(d) {
    const header = d.rows[d.headerRow] || [];
    const width = Math.max(...d.rows.slice(d.headerRow, d.headerRow + 6).map((r) => r.length), 1);
    const colName = (i) => `${tr("Spalte", "Column")} ${i + 1}${String(header[i] ?? "").trim() ? `: ${String(header[i]).trim().slice(0, 30)}` : ""}`;
    // [field, label, need, example]; need: "must", "one" (amount or debit/credit), "good" or "".
    const fields = [
      ["date", tr("Datum", "Date"), "must", tr("z. B. 04.11.2026 oder 2026-11-04, meist „Buchungstag“", "e.g. 04.11.2026 or 2026-11-04, often “booking date”")],
      ["amount", tr("Betrag", "Amount"), "one", tr("z. B. -74,00 für eine Abbuchung, 2.700,00 für Gehalt", "e.g. -74.00 for a debit, 2,700.00 for salary")],
      ["debit", tr("Ausgaben (Soll)", "Money out (debit)"), "pair", tr("nur wenn die Bank Ausgaben und Einnahmen in zwei Spalten trennt, z. B. 74,00", "only if the bank splits money out and in into two columns, e.g. 74.00")],
      ["credit", tr("Einnahmen (Haben)", "Money in (credit)"), "pair", tr("die zweite dieser Spalten, z. B. 2.700,00", "the second of these columns, e.g. 2,700.00")],
      ["sign", tr("Soll/Haben-Kennzeichen", "Debit/credit flag"), "", tr("nur bei Beträgen ohne Minus: S oder H, Soll oder Haben", "only for amounts without minus: S or H, debit or credit")],
      ["name", tr("Empfänger", "Payee"), "good", tr("wer das Geld bekommt, z. B. Stadtwerke Musterstadt", "who gets the money, e.g. Stadtwerke Musterstadt")],
      ["payer", tr("Zahler bei Einnahmen", "Payer of incoming money"), "", tr("nur wenn die Bank dafür eine eigene Spalte hat, z. B. dein Arbeitgeber", "only if the bank has a column of its own for it, e.g. your employer")],
      ["purpose", tr("Verwendungszweck", "Purpose"), "good", tr("z. B. Abschlag Strom Vertragskonto 998877", "e.g. electricity instalment contract 998877")],
      ["category", tr("Kategorie", "Category"), "", tr("falls die Bank Kategorien liefert, z. B. Lebensmittel", "if the bank provides categories, e.g. groceries")],
      ["account", tr("Eigenes Konto", "Own account"), "", tr("deine IBAN, wichtig bei mehreren Konten in einer Datei", "your IBAN, matters with several accounts in one file")],
      ["mandate", tr("Mandatsreferenz", "Mandate reference"), "", tr("bei Lastschriften, z. B. SW-998877", "for direct debits, e.g. SW-998877")],
      ["creditor", tr("Gläubiger-ID", "Creditor ID"), "", tr("bei Lastschriften, z. B. DE33ZZZ00000000003", "for direct debits, e.g. DE33ZZZ00000000003")],
    ];
    const needLabel = { must: tr("Pflicht", "required"), one: tr("Pflicht, oder Soll + Haben", "required, or debit + credit"), pair: tr("statt Betrag", "instead of amount"), good: tr("empfohlen", "recommended"), "": tr("optional", "optional") };
    const firstRow = d.rows[d.headerRow + 1] || [];
    const select = ([field, label, need, example]) => {
      const col = d.columns[field];
      const value = col !== undefined && col >= 0 ? String(firstRow[col] ?? "").trim() : "";
      let check = "";
      if (col !== undefined && col >= 0) {
        const f = columnFit(d.rows, d.headerRow, col, field, d.date, d.decimal);
        const good = f.of && f.fit / f.of >= 0.8;
        const what = { date: tr("wie ein Datum", "like a date"), amount: tr("wie ein Betrag", "like an amount"), debit: tr("wie ein Betrag", "like an amount"), credit: tr("wie ein Betrag", "like an amount"), account: tr("wie eine IBAN", "like an IBAN"), counter: tr("wie eine IBAN", "like an IBAN"), creditor: tr("wie eine Gläubiger-ID", "like a creditor ID"), sign: tr("wie S/H", "like S/H") }[field] || tr("wie Text", "like text");
        check = `<span class="csv-check ${good ? "ok" : "warn"}">${good ? "✓" : "⚠"} ${tr(`${f.fit} von ${f.of} Zeilen sehen ${what} aus`, `${f.fit} of ${f.of} rows look ${what}`)}</span>`;
      }
      const hint = (d.suggested || []).includes(field) ? `<span class="csv-need good">${tr("Vorschlag", "suggested")}</span>` : "";
      return `<label class="csv-map-field ${col !== undefined ? "set" : ""}"><span class="csv-map-label">${label} <span class="csv-need ${need || "opt"}">${needLabel[need]}</span>${hint}</span>
        <select data-change="csv-map" data-field="${field}">
          <option value="-1">—</option>
          ${Array.from({ length: width }, (_, i) => `<option value="${i}" ${col === i ? "selected" : ""}>${esc(colName(i))}</option>`).join("")}
        </select>
        <span class="csv-map-example">${esc(example)}</span>
        ${value ? `<span class="csv-map-value">${tr("in deiner Datei", "in your file")}: ${esc(value.slice(0, 60))}</span>` : ""}${check}</label>`;
    };
    const sample = d.rows.slice(d.headerRow + 1, d.headerRow + 6);
    let test = null;
    try {
      const profile = { columns: d.columns, header_row: d.headerRow, date: d.date, decimal: d.decimal };
      test = parseGenericCsv(d.sources[d.index].text, {}, profile).slice(0, 3);
    } catch (err) {
      test = null;
    }
    return `<form data-form="csv-map">
      <h2>${tr("Welche Spalte ist was?", "Which column is what?")}</h2>
      <p class="hint">${d.manual ? tr(`Prüfe für „${esc(d.name)}“, welche Spalte was enthält. Die Zuordnung wird für diese Bank gemerkt.`, `Check which column of “${esc(d.name)}” holds what. The assignment is remembered for this bank.`) : tr(`„${esc(d.name)}“ kenne ich noch nicht sicher. Sag einmal, welche Spalte was enthält. Das wird für diese Bank gemerkt, der nächste Import läuft dann ohne Nachfrage.`, `I don't know “${esc(d.name)}” reliably yet. Tell me once which column holds what. It is remembered for this bank, so the next import runs without asking.`)}</p>
      <label>${tr("Die Überschriften stehen in", "The headings are in")}<select data-change="csv-map" data-field="header_row">
        ${d.rows.slice(0, 30).map((r, i) => `<option value="${i}" ${i === d.headerRow ? "selected" : ""}>${tr("Zeile", "line")} ${i + 1}: ${esc(r.filter((c) => String(c).trim()).slice(0, 4).join(" · ").slice(0, 60))}</option>`).join("")}
      </select></label>
      <div class="csv-map-table"><table><thead>
        <tr>${Array.from({ length: width }, (_, i) => { const f = fields.find(([k]) => d.columns[k] === i); return `<th class="${f ? "on" : ""}">${f ? `<span class="csv-col-tag">${esc(f[1])}</span>` : `<span class="csv-col-tag off">${tr("nicht genutzt", "unused")}</span>`}</th>`; }).join("")}</tr>
        <tr>${Array.from({ length: width }, (_, i) => `<th>${esc(colName(i))}</th>`).join("")}</tr></thead>
        <tbody>${sample.map((r) => `<tr>${Array.from({ length: width }, (_, i) => `<td class="${fields.some(([k]) => d.columns[k] === i) ? "on" : ""}">${esc(String(r[i] ?? "").slice(0, 40))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="grid csv-map-fields">${fields.map(select).join("")}
        <label>${tr("Datumsformat", "Date format")}<select data-change="csv-map" data-field="date_format">
          <option value="dmy" ${d.date === "dmy" ? "selected" : ""}>${tr("Tag.Monat.Jahr", "day.month.year")}</option>
          <option value="mdy" ${d.date === "mdy" ? "selected" : ""}>${tr("Monat/Tag/Jahr", "month/day/year")}</option>
          <option value="ymd" ${d.date === "ymd" ? "selected" : ""}>${tr("Jahr-Monat-Tag", "year-month-day")}</option></select></label>
        <label>${tr("Dezimalzeichen", "Decimal mark")}<select data-change="csv-map" data-field="decimal_mark">
          <option value="," ${d.decimal === "," ? "selected" : ""}>${tr("Komma (1.234,56)", "comma (1.234,56)")}</option>
          <option value="." ${d.decimal === "." ? "selected" : ""}>${tr("Punkt (1,234.56)", "dot (1,234.56)")}</option></select></label>
      </div>
      <h3 class="csv-sub">${tr("So wird es gelesen", "This is how it reads")}</h3>
      ${test && test.length ? `<ul class="csv-map-test">${test.map((b) => `<li><span>${shortDate(b.date)}</span><span>${esc(b.name)}</span><b class="${b.amount < 0 ? "neg" : "pos"}">${this._moneyPlain(b.amount)}</b></li>`).join("")}</ul>`
        : `<p class="hint">${tr("Noch keine Umsätze lesbar. Wähle mindestens Datum und Betrag (oder Soll und Haben).", "No transactions readable yet. Choose at least date and amount (or debit and credit).")}</p>`}
      ${this._error ? `<div class="error">${esc(this._error)}</div>` : ""}
      <div class="dialog-actions"><span></span><div>
        <button type="button" class="secondary" data-action="close">${tr("Abbrechen", "Cancel")}</button>
        <button type="submit" ${test && test.length ? "" : "disabled"}>${tr("Übernehmen und weiter", "Apply and continue")}</button>
      </div></div>
    </form>`;
  }

  async _openCsv(fileNames, bookingLists, reread = null) {
    const fileName = fileNames.join(", ");
    // Several accounts: one CSV each, or one CSV with several accounts.
    const parsed = dropOwnTransfers(bookingLists.flat());
    const bookings = parsed.bookings;
    const items = this._state.items.filter((i) => i.owner === this._state.user.id);
    const from = bookings.reduce((m, b) => (b.date < m ? b.date : m), bookings[0].date);
    const to = bookings.reduce((m, b) => (b.date > m ? b.date : m), bookings[0].date);
    // Open dates of the own entries over the file's period, in steps the server allows.
    const entries = [];
    const since = [parseIso(from), addDays(parseIso(to), -744)].sort((a, b) => b - a)[0];
    for (let start = addDays(since, -14); start <= addDays(parseIso(to), 7); start = addDays(start, 366)) {
      const end = [addDays(start, 365), addDays(parseIso(to), 7)].sort((a, b) => a - b)[0];
      const f = await this._ws("forecast", { scope: "me", start: iso(start), end: iso(end) });
      entries.push(...f.days.flatMap((day) => day.entries));
    }
    const history = await this._ws("bank/history");
    const analysis = analyzeBank(bookings, items, history, entries);
    const bookingsByKey = {};
    for (const b of bookings) {
      (bookingsByKey[bankKeyOf(b)] ||= []).push(b);
    }
    // A look-alike entry is pre-selected as target, so its bookings are confirmed instead of a duplicate.
    for (const s of analysis.suggestions) {
      const twin = s.existing && items.find((i) => i.name === s.existing);
      if (twin) Object.assign(s, { target: twin.id, checked: true });
    }
    this._error = null;
    const accounts = new Set(bookings.map((b) => b.account).filter(Boolean)).size;
    this._dialog = { type: "csv", fileName, items, entries, history, bookingsByKey, accounts, transfers: parsed.transfers, bookings, saveLedger: true, reread, ...analysis };
    this._render();
  }

  async _readImportFile(input) {
    const files = [...(input.files || [])];
    input.value = "";
    const file = files[0];
    if (!file) return;
    try {
      const sources = await readBankSources(files);
      if (files.length > 1 || !/\.json$/i.test(file.name) || !sources[0]?.text.trim().startsWith("{")) {
        await this._openBankSources(sources);
        return;
      }
      const text = sources[0].text;
      const data = JSON.parse(text);
      if (data?.format !== "haushaltsbuch" || !Array.isArray(data.items)) throw new Error(tr("Das ist keine Export-Datei des Haushaltsbuchs.", "This is not a Household Budget export file."));
      this._error = null;
      this._dialog = { type: "import", data, fileName: file.name };
    } catch (err) {
      this._error = err instanceof SyntaxError ? tr("Die Datei ist kein gültiges JSON.", "The file is not valid JSON.") : err.message;
    }
    this._render();
  }
}
