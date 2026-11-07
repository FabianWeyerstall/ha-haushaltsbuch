/* Haushaltsbuch panel – Event handlers: every click, change and submit of the panel goes through here.
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { tr, DATE_LOCALE, shortDate, iso, parseIso, addDays, today } from "./format.js";
import { bankColumns, detectDateFormat, guessBankLayout, suggestColumns, bankSignature, nameKey, daysBetween } from "./bank-import.js";
import { presetOf } from "./schedule.js";

export class Events {
  _onSubmit(ev) {
    ev.preventDefault();
    const form = ev.target;
    const kind = form.dataset.form;
    if (kind === "item") {
      const item = this._readItemForm(form);
      const salaryBox = form.querySelector('[name="salary_cycle"]');
      const { editable, owner_name, owner, current_amount, contract_info, learned_days, budget_status, ...payload } = item;
      this._run(async () => {
        const saved = editable === false ? { id: item.id } : await this._ws("item/save", { item: payload });
        const st = this._state.user.settings || {};
        const isSalary = st.salary_item_id && st.salary_item_id === saved.id;
        const wantSalary = salaryBox?.checked && item.direction === "income";
        if (wantSalary && !isSalary) await this._ws("settings", { settings: { special_min_months: 2, special_min_amount: 0, ...st, salary_item_id: saved.id } });
        if (!wantSalary && isSalary) await this._ws("settings", { settings: { special_min_months: 2, special_min_amount: 0, ...st, salary_item_id: null } });
      });
    } else if (kind === "balance") {
      const f = new FormData(form);
      this._run(() => this._ws("balance", { scope: this._scope, balance: this._parsedAmount(f.get("balance"), NaN), balance_date: f.get("balance_date") }));
    } else if (kind === "confirm") {
      const f = new FormData(form);
      const d = this._dialog;
      this._run(() =>
        this._ws("confirm", { item_id: d.item_id, due_date: d.due, status: "booked", actual_date: f.get("actual_date") || null, actual_amount: this._parsedAmount(f.get("actual_amount"), null) })
      );
    } else if (kind === "csv-map") {
      const d = this._dialog;
      const profile = { columns: { ...d.columns }, header_row: d.headerRow, date: d.date, decimal: d.decimal };
      const signature = bankSignature(d.rows, d.headerRow);
      const settings = this._state.user.settings || {};
      if (signature) this._saveSpecialSettings({ csv_profiles: { ...(settings.csv_profiles || {}), [signature]: profile } });
      const forced = { ...d.forced, [d.index]: profile };
      this._openBankSources(d.sources, forced).catch((err) => {
        this._error = this._errorText(err);
        this._render();
      });
    } else if (kind === "assign") {
      const f = new FormData(form);
      const r = this._dialog.row;
      const direction = r[1] < 0 ? "expense" : "income";
      const amount = Math.abs(r[1]);
      const target = f.get("target");
      this._run(async () => {
        if (target === "once") {
          const item = { name: String(f.get("name") || r[2] || tr("Umsatz", "Transaction")).trim(), direction, amount, category: r[4] || r[3] || tr("Sonstiges", "Other"), icon: "mdi:receipt-text", start_date: r[0], schedule: { frequency: "once", interval: 1 }, confirmations: [{ due_date: r[0], status: "booked", actual_date: r[0], actual_amount: amount }] };
          await this._ws("import", { data: { format: "haushaltsbuch", items: [item] }, replace: false });
          return;
        }
        const item = this._state.items.find((i) => i.id === target);
        const sync = { confirmations: [], spendings: [], keys: [], price_changes: [] };
        if (item.schedule?.frequency === "budget") {
          sync.spendings.push({ item_id: item.id, date: r[0], amount, note: r[2] || "" });
        } else {
          const day = parseIso(r[0]);
          const scope = item.editable === false && item.household_id ? item.household_id : "me";
          const around = await this._ws("forecast", { scope, start: iso(addDays(day, -45)), end: iso(addDays(day, 45)) });
          const open = around.days.flatMap((x) => x.entries).filter((e) => e.item_id === item.id && e.status === null)
            .sort((a, b) => Math.abs(daysBetween(a.date, r[0])) - Math.abs(daysBetween(b.date, r[0])))[0];
          if (open) sync.confirmations.push({ item_id: item.id, due_date: open.due_date, actual_date: r[0], actual_amount: amount });
          else if (!(f.get("remember") && item.editable !== false) && !(item.confirmations || []).some((c) => c.actual_date === r[0] && Math.abs((c.actual_amount ?? -1) - amount) < 0.01)) {
            // No open date nearby (e.g. before the entry started, or that month is already
            // booked): keep the payment as a booking on its own date so it counts as assigned.
            if ((item.confirmations || []).some((c) => c.due_date === r[0])) throw new Error(tr(`„${item.name}“ hat am ${shortDate(r[0])} schon eine andere Buchung.`, `“${item.name}” already has another booking on ${shortDate(r[0])}.`));
            sync.confirmations.push({ item_id: item.id, due_date: r[0], actual_date: r[0], actual_amount: amount });
          }
        }
        if (f.get("remember") && item.editable !== false) sync.keys.push({ item_id: item.id, key: `n:${nameKey(r[2] || "")}|${direction}` });
        await this._ws("bank/sync", sync);
      });
    } else if (kind === "csv") {
      const d = this._dialog;
      this._run(async () => {
        const r = await this._csvApply(d);
        const parts = [
          r.added && tr(`${r.added} neue Posten`, `${r.added} new entries`),
          r.confirmed && tr(`${r.confirmed} Buchungen abgehakt`, `${r.confirmed} bookings confirmed`),
          r.spendings && tr(`${r.spendings} Budget-Ausgaben eingetragen`, `${r.spendings} budget expenses added`),
          r.price_changes && tr(`${r.price_changes} Preisänderungen`, `${r.price_changes} price changes`),
          r.ledger && tr(`${r.ledger} Umsätze für die Statistik gespeichert`, `${r.ledger} transactions saved for statistics`),
        ].filter(Boolean);
        setTimeout(() => {
          this._dialog = { type: "notice", title: tr("Abgleich fertig", "Done"), text: parts.length ? `${parts.join(", ")}.` : tr("Es war schon alles da.", "Everything was there already.") };
          this._render();
        });
      });
    } else if (kind === "import") {
      const replace = new FormData(form).get("mode") === "replace";
      if (replace && !confirm(tr("Alle deine eigenen Posten werden durch den Import ersetzt. Fortfahren?", "All your own entries will be replaced by the import. Continue?"))) return;
      const data = this._dialog.data;
      this._run(async () => {
        const r = await this._ws("import", { data, replace });
        setTimeout(() => {
          this._dialog = {
            type: "notice",
            title: tr("Import abgeschlossen", "Import finished"),
            text: tr(`${r.added} Posten importiert${r.skipped ? `, ${r.skipped} schon vorhanden und übersprungen` : ""}.`, `${r.added} entries imported${r.skipped ? `, ${r.skipped} already existed and were skipped` : ""}.`),
          };
          this._render();
        });
      });
    } else if (kind === "spending") {
      const f = new FormData(form);
      const d = this._dialog;
      const values = { date: f.get("date"), amount: this._parsedAmount(f.get("amount")), note: f.get("note") || null };
      const target = f.get("item_id");
      this._run(async () => {
        if (!d.spending) await this._ws("spending/add", { item_id: target, ...values });
        else if (target === d.item_id) await this._ws("spending/update", { item_id: target, spending_id: d.spending.id, ...values });
        else {
          // Moved to another budget: record it there, then remove the old one.
          await this._ws("spending/add", { item_id: target, ...values });
          await this._ws("spending/delete", { item_id: d.item_id, spending_id: d.spending.id });
        }
      });
    } else if (kind === "household") {
      const f = new FormData(form);
      const members = f.getAll("members");
      const h = this._dialog.household;
      if (h?.id) this._run(() => this._ws("household/update", { household_id: h.id, name: f.get("name"), members }));
      else this._run(() => this._ws("household/create", { name: f.get("name"), members }));
    }
  }

  _onChange(ev) {
    const el = ev.target;
    const kind = el.dataset.change;
    if (kind === "scope") {
      this._scope = el.value;
      this._selectedDay = null;
      this._reload();
    } else if (kind === "has_contract") {
      const form = el.closest("form");
      this._dialog.item = this._readItemForm(form);
      this._dialog.hasContract = el.checked;
      this._render();
    } else if (kind === "has_end") {
      const form = el.closest("form");
      this._dialog.item = this._readItemForm(form);
      this._dialog.hasEnd = el.checked;
      this._render();
    } else if (kind === "direction") {
      const form = el.closest("form");
      this._dialog.item = this._readItemForm(form);
      this._render();
    } else if (kind === "preset") {
      const form = el.closest("form");
      this._dialog.item = this._readItemForm(form);
      this._dialog.preset = el.value;
      this._render();
    } else if (kind === "special-months") {
      this._saveSpecialSettings({ special_min_months: Number(el.value) });
    } else if (kind === "special-amount") {
      this._saveSpecialSettings({ special_min_amount: Number(el.value) || 0 });
    } else if (kind === "backup-file") {
      const file = el.files?.[0];
      el.value = "";
      if (!file) return;
      file.text().then((text) => {
        let doc;
        try {
          doc = JSON.parse(text);
        } catch {
          doc = null;
        }
        if (doc?.format !== "haushaltsbuch-backup") {
          this._error = tr("Das ist keine Sicherungsdatei des Haushaltsbuchs. Eine Export-Datei spielst du unter „Posten“ → „Importieren“ ein.", "This is not a Household Budget backup file. Import an export file under “Entries” → “Import”.");
          this._render();
          return;
        }
        if (!confirm(tr(`Alles auf den Stand der Datei vom ${new Date(doc.created).toLocaleString(DATE_LOCALE)} zurücksetzen? Das gilt für alle Nutzer. Der jetzige Stand wird vorher gesichert.`, `Reset everything to the file from ${new Date(doc.created).toLocaleString(DATE_LOCALE)}? This applies to all users. The current state is backed up first.`))) return;
        this._run(async () => this._restoreFinished(await this._ws("backup/restore", { document: doc })));
      });
    } else if (kind === "stats-year") {
      this._statsYear = el.value;
      this._statsOpen = null;
      this._statsPick = null;
      this._render();
    } else if (kind === "stats-account") {
      this._statsAccount = el.value;
      this._render();
    } else if (kind === "import-file") {
      this._readImportFile(el);
    } else if (kind === "csv-map") {
      const d = this._dialog;
      const field = el.dataset.field;
      if (field === "header_row") {
        d.headerRow = Number(el.value);
        const s = suggestColumns(d.rows, d.headerRow, bankColumns(d.rows[d.headerRow] || []), d.date, d.decimal);
        d.columns = s.columns;
        d.suggested = [...s.suggested];
      } else if (field === "date_format") d.date = el.value;
      else if (field === "decimal_mark") d.decimal = el.value;
      else {
        if (Number(el.value) < 0) delete d.columns[field];
        else {
          // One column, one meaning: a column chosen here leaves the field it had.
          for (const [f, i] of Object.entries(d.columns)) if (i === Number(el.value) && f !== field) delete d.columns[f];
          d.columns[field] = Number(el.value);
        }
        d.suggested = (d.suggested || []).filter((f) => f !== field);
        if (field === "date" && d.columns.date !== undefined) d.date = detectDateFormat(d.rows.slice(d.headerRow + 1, d.headerRow + 41).map((r) => r[d.columns.date]));
      }
      const scroll = this.shadowRoot.querySelector(".dialog")?.scrollTop || 0;
      this._render();
      const dialog = this.shadowRoot.querySelector(".dialog");
      if (dialog) dialog.scrollTop = scroll;
    } else if (kind === "csv-spend") {
      const d = this._dialog;
      const m = d.matches.find((x) => x.key === el.dataset.key);
      m.spendings[Number(el.dataset.index)].target = el.value;
      m.checked = true;
      m.open = true;
      const scroll = this.shadowRoot.querySelector(".dialog")?.scrollTop || 0;
      this._render();
      const dialog = this.shadowRoot.querySelector(".dialog");
      if (dialog) dialog.scrollTop = scroll;
    } else if (kind === "csv-check" || kind === "csv-name" || kind === "csv-price" || kind === "csv-target" || kind === "csv-ledger") {
      const d = this._dialog;
      const s = this._csvAll(d).find((x) => x.key === el.dataset.key);
      if (kind === "csv-ledger") d.saveLedger = el.checked;
      else if (kind === "csv-check") s.checked = el.checked;
      else if (kind === "csv-price") s.priceChange.checked = el.checked;
      else if (kind === "csv-name") s.name = el.value.trim() || s.name;
      else {
        s.target = el.value;
        s.checked = true;
        const scroll = this.shadowRoot.querySelector(".dialog")?.scrollTop || 0;
        this._render();
        const dialog = this.shadowRoot.querySelector(".dialog");
        if (dialog) dialog.scrollTop = scroll;
        return;
      }
      const button = this.shadowRoot.querySelector(".csv-submit");
      const n = this._csvCounts(d);
      button.textContent = this._csvSubmitLabel(n, d.saveLedger);
      button.disabled = !n && !d.saveLedger;
    } else if (kind === "entities") {
      this._run(() => this._ws("household/update", { household_id: el.dataset.id, entities: el.checked }));
    }
  }

  _onClick(ev) {
    const help = ev.target.closest?.(".help");
    if (help) {
      // The ⓘ only explains; a tap shows (or hides) its text, nothing else opens.
      ev.stopPropagation();
      // A tap also fires mouseover first, which already opened the text.
      if (this._helpFor === help && Date.now() - this._helpShownAt > 500) this._hideHelp();
      else if (this._helpFor !== help) this._showHelp(help);
      if (this._helpFor) this._helpByHover = false;
      return;
    }
    this._hideHelp();
    const target = ev.target.closest("[data-action]");
    if (!target) return;
    const a = target.dataset.action;
    if (a === "pick-suggest") {
      ev.preventDefault();
      const input = target.closest(".suggest-field")?.querySelector("input");
      if (input) this._pickSuggestion(input, target.dataset.value);
      return;
    }
    if (a === "incognito") {
      ev.preventDefault();
      this._toggleIncognito();
      return;
    }
    if (a === "close-overlay") {
      if (ev.target === target) {
        this._dialog = null;
        this._error = null;
        this._render();
      }
      return;
    }
    ev.stopPropagation();
    switch (a) {
      case "backup-create":
        this._run(() => this._ws("backup/create", { reason: "manual" }));
        break;
      case "backup-download":
        this._ws("backup/get", { backup_id: target.dataset.id })
          .then((doc) => this._downloadJson(`haushaltsbuch-sicherung-${target.dataset.id}`, doc))
          .catch((err) => {
            this._error = this._errorText(err);
            this._render();
          });
        break;
      case "backup-restore":
        if (confirm(tr(`Alles auf den Stand vom ${target.dataset.created} zurücksetzen? Das gilt für alle Nutzer. Der jetzige Stand wird vorher gesichert.`, `Reset everything to ${target.dataset.created}? This applies to all users. The current state is backed up first.`))) {
          this._run(async () => this._restoreFinished(await this._ws("backup/restore", { backup_id: target.dataset.id })));
        }
        break;
      case "backup-upload":
        this.shadowRoot.querySelector('input[data-change="backup-file"]').click();
        break;
      case "stats-year":
        this._statsYear = target.dataset.year;
        this._render();
        break;
      case "stats-tab":
        this._statsTab = target.dataset.tab;
        this._render();
        break;
      case "csv-remap": {
        const { sources, forced, remap } = this._dialog.reread;
        const index = remap[0];
        const info = guessBankLayout(sources[index].text);
        const profile = forced[index] || (this._state.user.settings?.csv_profiles || {})[bankSignature(info.rows, info.headerRow)];
        if (profile) Object.assign(info, { headerRow: profile.header_row, columns: { ...profile.columns }, date: profile.date || info.date, decimal: profile.decimal || info.decimal });
        info.headerRow = Math.max(0, info.headerRow);
        this._openColumnDialog(sources, forced, index, info, true);
        break;
      }
      case "stats-period": {
        const p = target.dataset.period;
        const rows = this._ledger?.rows || [];
        const latest = rows.length ? rows[rows.length - 1][0] : iso(new Date());
        const curYear = this._statsYear && this._statsYear !== "all" ? this._statsYear : latest.slice(0, 4);
        if (p === "all") {
          this._statsYear = "all";
          this._statsMonth = null;
        } else if (p === "year") {
          this._statsYear = this._statsMonth ? this._statsMonth.slice(0, 4) : curYear;
          this._statsMonth = null;
        } else if (!this._statsMonth) {
          const inYear = rows.filter((r) => r[0].startsWith(curYear));
          this._statsYear = curYear;
          const monthOf = this._statsMonthKey || ((d) => d.slice(0, 7));
          this._statsMonth = monthOf(inYear.length ? inYear[inYear.length - 1][0] : latest);
          this._statsYear = this._statsMonth.slice(0, 4);
        }
        this._statsOpen = null;
        this._statsPick = null;
        this._render();
        break;
      }
      case "stats-step": {
        const to = target.dataset.to;
        this._statsYear = to.slice(0, 4);
        this._statsMonth = to.includes("-") ? to : null;
        this._statsOpen = null;
        this._statsPick = null;
        this._render();
        break;
      }
      case "budget-hit-remove": {
        const st = this._state.user.settings || {};
        this._openHits = target.dataset.budget;
        this._saveSpecialSettings({ stats_ignored: [...(st.stats_ignored || []), target.dataset.key] });
        break;
      }
      case "budget-hit-restore": {
        const st = this._state.user.settings || {};
        this._openHits = target.dataset.budget;
        this._saveSpecialSettings({ stats_ignored: (st.stats_ignored || []).filter((k) => !k.startsWith(`x:${target.dataset.budget}|`)) });
        break;
      }
      case "insight-show-ignored":
        this._showIgnored = !this._showIgnored;
        this._render();
        break;
      case "insight-unignore": {
        const st = this._state.user.settings || {};
        this._saveSpecialSettings({ stats_ignored: (st.stats_ignored || []).filter((k) => k !== target.dataset.key) });
        break;
      }
      case "insight-ignore": {
        const st = this._state.user.settings || {};
        this._saveSpecialSettings({ stats_ignored: [...(st.stats_ignored || []), target.dataset.key] });
        break;
      }
      case "insight-create": {
        const s = this._insightSuggestions?.[target.dataset.key];
        if (!s) break;
        const item = {
          name: s.name, direction: s.direction, amount: s.amount, amount_variance_pct: s.variance, date_tolerance_days: s.tolerance || 0,
          category: s.category, icon: s.icon, start_date: s.due, schedule: s.schedule, weekend_shift: s.category === "Gehalt" ? "previous" : null,
          note: tr("Aus der Statistik angelegt", "Created from statistics"), bank_keys: [s.bankKey],
          confirmations: [{ due_date: s.due, status: "booked", actual_date: s.last, actual_amount: s.amount }],
        };
        this._run(() => this._ws("import", { data: { format: "haushaltsbuch", items: [item] }, replace: false }));
        break;
      }
      case "insight-budget": {
        const item = this._state.items.find((i) => i.id === target.dataset.id);
        if (!item) break;
        const { editable, owner_name, owner, current_amount, contract_info, learned_days, budget_status, ...payload } = item;
        this._run(() => this._ws("item/save", { item: { ...payload, amount: Number(target.dataset.amount) } }));
        break;
      }
      case "ledger-assign":
        this._error = null;
        this._dialog = this._assignDialog(this._ledger.rows[Number(target.dataset.row)], target.dataset.current || "");
        this._render();
        break;
      case "stats-month":
        this._statsMonth = this._statsMonth === target.dataset.month ? null : target.dataset.month;
        this._statsOpen = null;
        this._statsPick = null;
        this._render();
        break;
      case "stats-mode":
        this._statsMode = target.dataset.mode;
        this._render();
        break;
      case "stats-cat":
        this._statsOpen = this._statsOpen === target.dataset.cat ? null : target.dataset.cat;
        this._statsPick = null;
        this._render();
        break;
      case "stats-pick": {
        const same = this._statsPick?.kind === target.dataset.kind && this._statsPick?.name === target.dataset.name;
        this._statsPick = same ? null : { kind: target.dataset.kind, name: target.dataset.name };
        this._statsMore = false;
        this._render();
        break;
      }
      case "stats-more":
        this._statsMore = true;
        this._render();
        break;
      case "stats-clear":
        if (confirm(tr("Alle gespeicherten Umsätze löschen? Deine Posten bleiben.", "Delete all saved transactions? Your entries stay."))) this._run(() => this._ws("ledger/clear"));
        break;
      case "view":
        this._view = target.dataset.view;
        this._reload();
        break;
      case "range":
        this._range = Number(target.dataset.range);
        this._reload();
        break;
      case "month":
        this._month = new Date(this._month.getFullYear(), this._month.getMonth() + Number(target.dataset.delta), 1);
        this._selectedDay = null;
        this._reload();
        break;
      case "dash-toggle":
        this._dashOpen = this._dashOpen === target.dataset.key ? null : target.dataset.key;
        this._render();
        break;
      case "toggle-month":
        this._openMonth = this._openMonth === target.dataset.month ? null : target.dataset.month;
        this._render();
        break;
      case "select-day":
        this._selectedDay = target.dataset.day;
        this._render();
        break;
      case "close":
        this._dialog = null;
        this._error = null;
        this._render();
        break;
      case "edit-balance":
        this._dialog = { type: "balance" };
        this._render();
        break;
      case "export":
        this._export();
        break;
      case "price-add": {
        const item = this._readItemForm(target.closest("form"));
        item.price_changes = [...item.price_changes, { from: iso(today()), amount: item.amount }];
        this._dialog.item = item;
        this._render();
        break;
      }
      case "price-remove": {
        const item = this._readItemForm(target.closest("form"));
        item.price_changes = item.price_changes.filter((_, i) => i !== Number(target.dataset.index));
        this._dialog.item = item;
        this._render();
        break;
      }
      case "confirm-all":
        this._run(async () => {
          for (const e of this._pending) await this._ws("confirm", { item_id: e.item_id, due_date: e.due_date, status: "booked" });
        });
        break;
      case "import":
        this.shadowRoot.querySelector('input[data-change="import-file"]').click();
        break;
      case "new-item":
        this._dialog = {
          type: "item",
          item: { direction: "expense", schedule: { frequency: "monthly", interval: 1 }, start_date: iso(today()), household_id: this._isHousehold() ? this._scope : null, editable: true },
        };
        this._render();
        break;
      case "template": {
        const t = this._templates()[Number(target.dataset.index)];
        const form = target.closest("form");
        const current = this._readItemForm(form);
        this._dialog.item = {
          ...current,
          name: t.name,
          direction: t.direction,
          category: t.category,
          icon: t.icon,
          amount: t.amount ?? current.amount,
          certainty: t.certainty || null,
          date_tolerance_days: t.date_tolerance_days || 0,
          weekend_shift: t.weekend_shift || null,
          amount_variance_pct: t.amount_variance_pct || 0,
          schedule: { frequency: t.frequency, interval: t.interval || 1, dates: t.dates || [], ...(t.unit ? { unit: t.unit } : {}) },
        };
        this._dialog.preset = presetOf(this._dialog.item.schedule);
        this._render();
        break;
      }
      case "edit-item": {
        const item = this._state.items.find((i) => i.id === target.dataset.item);
        if (item) {
          this._dialog = { type: "item", item: { ...item } };
          this._render();
        }
        break;
      }
      case "duplicate-item": {
        // A new entry with every setting of this one (including unsaved changes in the form);
        // bookings, spendings and remembered bank payees stay with the original.
        const original = this._dialog.item;
        const source = original.editable === false ? original : this._readItemForm(target.closest("form"));
        const { id, owner, owner_name, editable, current_amount, contract_info, learned_days, budget_status, bank_keys, confirmations, overrides, spendings, ...settings } = source;
        this._error = null;
        this._dialog = {
          type: "item",
          copyOf: original.name,
          hasEnd: Boolean(settings.end_date),
          item: { ...settings, name: tr(`${original.name} (Kopie)`, `${original.name} (copy)`), editable: true },
        };
        this._render();
        break;
      }
      case "delete-item":
        if (confirm(tr(`„${this._dialog.item.name}“ wirklich löschen?`, `Really delete “${this._dialog.item.name}”?`))) this._run(() => this._ws("item/delete", { item_id: this._dialog.item.id }));
        break;
      case "open-entry":
        this._dialog = { type: "confirm", item_id: target.dataset.item, due: target.dataset.due, date: target.dataset.date, amount: target.dataset.amount, status: target.dataset.status, planned: Boolean(target.dataset.planned) };
        this._render();
        break;
      case "quick-confirm":
        this._run(() => this._ws("confirm", { item_id: target.dataset.item, due_date: target.dataset.due, status: target.dataset.status }));
        break;
      case "plan-save": {
        const form = target.closest("form");
        if (!form.reportValidity()) break;
        const f = new FormData(form);
        const amount = this._parsedAmount(f.get("actual_amount"), null);
        this._run(() => this._ws("plan", { item_id: this._dialog.item_id, due_date: this._dialog.due, date: f.get("actual_date"), amount }));
        break;
      }
      case "plan-clear":
        this._run(() => this._ws("plan", { item_id: this._dialog.item_id, due_date: this._dialog.due, date: null }));
        break;
      case "confirm-skip":
        this._run(() => this._ws("confirm", { item_id: this._dialog.item_id, due_date: this._dialog.due, status: "skipped" }));
        break;
      case "reset-confirm":
        this._run(() => this._ws("confirm", { item_id: this._dialog.item_id, due_date: this._dialog.due, status: null }));
        break;
      case "budget-toggle":
        this._budgetOpen = this._budgetOpen === target.dataset.item ? null : target.dataset.item;
        this._render();
        break;
      case "spending-new":
        this._error = null;
        this._dialog = { type: "spending", item_id: target.dataset.item || null };
        this._render();
        break;
      case "spending-edit": {
        const item = this._state.items.find((i) => i.id === target.dataset.item);
        const spending = item?.budget_status?.spendings.find((x) => x.id === target.dataset.id);
        if (spending) {
          this._error = null;
          this._dialog = { type: "spending", item_id: item.id, spending: { ...spending } };
          this._render();
        }
        break;
      }
      case "spending-delete":
        if (confirm(tr("Diese Ausgabe löschen?", "Delete this spending?"))) this._run(() => this._ws("spending/delete", { item_id: target.dataset.item, spending_id: target.dataset.id }));
        break;
      case "new-household":
        this._dialog = { type: "household", household: null };
        this._render();
        break;
      case "edit-household":
        this._dialog = { type: "household", household: this._state.households.find((h) => h.id === target.dataset.id) };
        this._render();
        break;
      case "delete-household":
        if (confirm(tr("Haushalt löschen? Die Posten bleiben bei ihren Besitzern erhalten und werden wieder privat.", "Delete household? The entries stay with their owners and become private again."))) this._run(() => this._ws("household/delete", { household_id: this._dialog.household.id }));
        break;
      case "leave-household":
        if (confirm(tr("Haushalt verlassen? Deine Posten darin werden wieder privat.", "Leave household? Your entries in it become private again."))) this._run(() => this._ws("household/leave", { household_id: target.dataset.id }));
        break;
      default:
        break;
    }
  }
}
