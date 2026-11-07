/* Haushaltsbuch panel – Dialogs for one entry: entry form, price changes, contract, confirming a booking, icon/category suggestions.
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { LANG, tr, fmtDate, weekdayLong, WEEK_ORDINALS, CERTAINTY, certaintyLabel, FREQUENCY_PRESETS, NOTICE_UNITS, shortDate, esc, iso, today } from "./format.js";
import { loadIconList, searchIcons } from "./icons.js";
import { presetOf } from "./schedule.js";

export class ItemDialog {
  _renderItemForm(d) {
    const item = d.item;
    const preset = d.preset || presetOf(item.schedule);
    const readOnly = item.id && !item.editable;
    // iOS shows an empty date field as today and offers no way to clear it,
    // so the end date is only present while the checkbox is ticked.
    const hasEnd = d.hasEnd ?? Boolean(item.end_date);
    const dis = readOnly ? "disabled" : "";
    const templates = !item.id && !d.copyOf
      ? `<div class="templates">${this._templates()
          .map((t, idx) => `<button type="button" class="template" data-action="template" data-index="${idx}">${this._icon(t.icon, 18)}<span>${esc(t.name)}</span></button>`)
          .join("")}</div>`
      : "";
    const dates = (item.schedule?.dates || []).map((md) => {
      const [m, day] = md.split("-");
      return `${day}.${m}.`;
    });
    return `<form data-form="item">
      <h2>${readOnly ? esc(item.name) : item.id ? tr("Posten bearbeiten", "Edit entry") : d.copyOf ? tr("Posten duplizieren", "Duplicate entry") : tr("Neuer Posten", "New entry")}</h2>
      ${d.copyOf ? `<p class="hint">${tr(`Kopie von „${esc(d.copyOf)}“ mit allen Einstellungen. Passe Name, Betrag und was sonst anders ist an und speichere. Bisherige Buchungen werden nicht mitkopiert.`, `Copy of “${esc(d.copyOf)}” with all settings. Change the name, amount and whatever else differs, then save. Past bookings are not copied.`)}</p>` : ""}
      ${readOnly ? `<p class="hint">${tr(`Dieser Posten gehört ${esc(item.owner_name)} und kann nur von dort geändert werden.`, `This entry belongs to ${esc(item.owner_name)} and can only be changed by them.`)}</p>` : ""}
      ${templates}
      ${item.id && preset === "budget" && item.budget_status ? `<div class="budget-in-form">${this._renderBudgetBar(item, { list: false })}<button type="button" class="small" data-action="spending-new" data-item="${esc(item.id)}">+ ${tr("Ausgabe erfassen", "Add spending")}</button></div>` : ""}
      <div class="grid">
        <label class="full">${tr("Name", "Name")}<input name="name" required maxlength="100" value="${esc(item.name)}" ${dis}></label>
        <label>${tr("Art", "Type")}<select name="direction" data-change="direction" ${dis}>
          <option value="expense" ${item.direction !== "income" ? "selected" : ""}>${tr("Ausgabe", "Expense")}</option>
          <option value="income" ${item.direction === "income" ? "selected" : ""}>${tr("Einnahme", "Income")}</option>
        </select></label>
        <label>${preset === "budget" ? tr("Budget pro Monat", "Budget per month") : (item.price_changes || []).length ? tr("Betrag am Anfang", "Initial amount") : tr("Betrag", "Amount")} (${esc(this._state.currency)})<input name="amount" ${this._amountAttrs()} required value="${this._amountValue(item.amount)}" ${dis}></label>
        <label class="suggest-field">${tr("Kategorie", "Category")}<input name="category" autocomplete="off" required placeholder="${tr("Auswählen oder neue eingeben", "Pick one or type a new one")}" value="${esc(item.category || "")}" ${dis}><div class="suggest" hidden></div></label>
        <label class="suggest-field">${tr("Symbol", "Icon")} <span class="icon-preview">${this._icon(item.icon, 20)}</span><input name="icon" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${tr("Suchen, z.B. auto, haus, strom – oder Emoji", "Search, e.g. car, home, flash – or emoji")}" value="${esc(item.icon || "")}" ${dis}><div class="suggest" hidden></div></label>
        <label>${tr("Turnus", "Repeats")}<select name="preset" data-change="preset" ${dis}>
          ${FREQUENCY_PRESETS.map((p) => `<option value="${p.key}" ${p.key === preset ? "selected" : ""}>${p[LANG]}</option>`).join("")}
        </select></label>
        ${preset === "monthly_weekday" ? `<label>${tr("Welcher Tag?", "Which day?")}<span class="inline-fields"><select name="week" ${dis}>
          ${WEEK_ORDINALS.map(([w, de, en]) => `<option value="${w}" ${w === (item.schedule?.week ?? -1) ? "selected" : ""}>${tr(de.replace(/n$/, "r"), en)}</option>`).join("")}
        </select><select name="weekday" ${dis}>
          ${[0, 1, 2, 3, 4, 5, 6].map((w) => `<option value="${w}" ${w === (item.schedule?.weekday ?? 3) ? "selected" : ""}>${weekdayLong(w)}</option>`).join("")}
        </select></span></label>` : ""}
        ${preset === "every_n_months" ? `<label>${tr("Alle wie viele Monate?", "Every how many months?")}<input name="interval" type="number" min="1" max="120" value="${item.schedule?.interval || 2}" ${dis}></label>` : ""}
        ${preset === "rolling" ? `<label>${tr("Nächster Termin nach", "Next date after")}<span class="inline-fields"><input name="interval" type="number" min="1" max="120" value="${item.schedule?.interval || 1}" ${dis}><select name="unit" ${dis}>
          <option value="months" ${item.schedule?.unit !== "weeks" ? "selected" : ""}>${tr("Monat(en)", "month(s)")}</option>
          <option value="weeks" ${item.schedule?.unit === "weeks" ? "selected" : ""}>${tr("Woche(n)", "week(s)")}</option>
        </select></span></label>
        <label class="check full"><input type="checkbox" name="learn" ${item.schedule?.learn !== false ? "checked" : ""} ${dis}> ${tr("Abstand aus bestätigten Terminen lernen", "Learn the interval from confirmed dates")}${item.learned_days ? tr(` (zurzeit ~${item.learned_days} Tage)`, ` (currently ~${item.learned_days} days)`) : ""}</label>
        <p class="hint full">${tr("Der nächste Termin richtet sich nach dem letzten. Ab drei bestätigten Terminen rechnet die App mit deinem echten durchschnittlichen Abstand. Tippe in der Zeitleiste auf einen Eintrag, um einen festen Termin einzutragen. Alle weiteren rücken dann nach.", "The next date follows the last one. From three confirmed dates on, the app uses your real average interval. Tap an entry in the timeline to set a fixed date; all later ones move along.")}</p>` : ""}
        ${preset === "weekly" ? `<label>${tr("Alle wie viele Wochen?", "Every how many weeks?")}<input name="interval" type="number" min="1" max="52" value="${item.schedule?.interval || 1}" ${dis}></label>` : ""}
        ${preset === "budget" ? `<p class="hint full">${tr("Für Ausgaben ohne feste Termine, z.B. Lebensmittel oder Freizeit. Das Budget wird über die Tage des Monats verteilt vom erwarteten Kontostand abgezogen. Trägst du echte Ausgaben ein (unter „Budgets diesen Monat“ oder per Aktion haushaltsbuch.add_expense), wird der Rest kleiner. Was übrig bleibt, verfällt am Monatsende. Kein fester Betrag? Trag 0 ein, dann zählt nur, was du einträgst (z.B. für Ungeplantes).", "For spending without fixed dates, e.g. groceries or leisure. The budget is taken off the expected balance spread over the days of the month. When you enter real spendings (under “Budgets this month” or with the action haushaltsbuch.add_expense), the rest shrinks. Whatever is left expires at the end of the month. No fixed amount? Enter 0 and only what you enter counts (e.g. for unplanned purchases).")}</p>` : ""}
        ${preset === "fixed_dates" ? `<label class="full">${tr("Termine im Jahr (TT.MM., durch Komma getrennt)", "Dates each year (DD.MM., comma separated)")}<input name="dates" placeholder="01.04., 15.10." value="${esc(dates.join(", "))}" ${dis}></label>` : ""}
        <label>${preset === "once" ? tr("Datum", "Date") : preset === "fixed_dates" || preset === "budget" || preset === "monthly_weekday" ? tr("Gültig ab", "Valid from") : preset === "rolling" ? tr("Erster Termin", "First date") : tr("Erste Fälligkeit", "First due date")}<input name="start_date" type="date" required value="${esc(item.start_date || iso(today()))}" ${dis}></label>
        ${preset !== "once" ? `<div class="end-date">
          <label class="check"><input type="checkbox" name="has_end" data-change="has_end" ${hasEnd ? "checked" : ""} ${dis}> ${tr("Enddatum festlegen", "Set an end date")}</label>
          ${hasEnd ? `<input name="end_date" type="date" aria-label="${tr("Enddatum", "End date")}" required value="${esc(item.end_date || "")}" ${dis}>` : ""}
        </div>` : ""}
        ${(() => {
          const salaryOk = item.direction === "income" && preset !== "once" && preset !== "budget";
          const checked = salaryOk && (d.salaryCycle ?? (item.id && item.id === this._state.user.settings?.salary_item_id));
          return `<label class="check full ${salaryOk ? "" : "muted"}"><input type="checkbox" name="salary_cycle" ${dis || (salaryOk ? "" : "disabled")} ${checked ? "checked" : ""}> <span>${tr("Mein Monat beginnt mit dieser Einnahme (Gehalt)", "My month starts with this income (salary)")}${salaryOk ? "" : `<small>${tr("nur bei wiederkehrenden Einnahmen", "only for recurring income")}</small>`}</span>${this._help(tr("Dann laufen Monatsübersicht und Auswertungen von Gehalt zu Gehalt statt vom 1. bis zum Monatsende. Ein Gehalt nach dem 15. zählt zum Folgemonat, weil es dessen Abbuchungen bezahlt. Geht nur bei wiederkehrenden Einnahmen, nicht bei Ausgaben, einmaligen Posten oder Budgets.", "The monthly overview and the figures then run from payday to payday instead of the 1st to the month end. A salary paid after the 15th counts for the next month, because it pays that month's bills. Only for recurring income, not for expenses, one-off entries or budgets."))}</label>`;
        })()}
      </div>
      ${preset !== "once" ? this._renderPriceChanges(item, dis) : ""}
      ${preset !== "once" && preset !== "budget" ? this._renderContractFields(d, dis) : ""}
      <details ${item.amount_variance_pct || item.date_tolerance_days || item.certainty || item.weekend_shift ? "open" : ""}>
        <summary>${tr("Schwankung und Sicherheit", "Variation and certainty")}</summary>
        <div class="grid">
          <label>${tr("Betrag schwankt um ± %", "Amount varies by ± %")}<input name="amount_variance_pct" type="number" min="0" max="100" step="1" value="${item.amount_variance_pct || 0}" ${dis}></label>
          <label>${tr("Datum schwankt um ± Tage", "Date varies by ± days")}<input name="date_tolerance_days" type="number" min="0" max="60" value="${item.date_tolerance_days || 0}" ${dis}></label>
          <label>${tr("Sicherheit", "Certainty")}<select name="certainty" ${dis}>
            <option value="">${tr("automatisch", "automatic")}</option>
            ${Object.keys(CERTAINTY).map((c) => `<option value="${c}" ${item.certainty === c ? "selected" : ""}>${tr("immer", "always")} ${certaintyLabel(c)}</option>`).join("")}
          </select></label>
          <label>${tr("Wochenende/Feiertag", "Weekend/holiday")}<select name="weekend_shift" ${dis}>
            <option value="">${tr("automatisch (nächster Bankarbeitstag)", "automatic (next banking day)")}</option>
            <option value="next" ${item.weekend_shift === "next" ? "selected" : ""}>${tr("nächster Bankarbeitstag", "next banking day")}</option>
            <option value="previous" ${item.weekend_shift === "previous" ? "selected" : ""}>${tr("vorheriger Bankarbeitstag", "previous banking day")}</option>
            <option value="none" ${item.weekend_shift === "none" ? "selected" : ""}>${tr("nicht verschieben", "don't move")}</option>
          </select></label>
        </div>
      </details>
      <div class="grid">
        ${this._state.households.length ? `<label class="full">${tr("Sichtbar für", "Visible to")}<select name="household_id" ${dis}>
          <option value="">${tr("nur mich", "only me")}</option>
          ${this._state.households.map((h) => `<option value="${esc(h.id)}" ${item.household_id === h.id ? "selected" : ""}>${tr("Haushalt", "Household")} ${esc(h.name)}</option>`).join("")}
        </select></label>` : ""}
        <label class="full">${tr("Notiz", "Note")}<textarea name="note" rows="2" maxlength="1000" ${dis}>${esc(item.note || "")}</textarea></label>
      </div>
      ${this._error ? `<div class="error">${esc(this._error)}</div>` : ""}
      <div class="dialog-actions">
        <div>
          ${item.id && item.editable ? `<button type="button" class="danger" data-action="delete-item">${tr("Löschen", "Delete")}</button>` : ""}
          ${item.id ? `<button type="button" class="secondary" data-action="duplicate-item">${tr("Duplizieren", "Duplicate")}</button>` : ""}
        </div>
        <div>
          <button type="button" class="secondary" data-action="close">${readOnly ? tr("Schließen", "Close") : tr("Abbrechen", "Cancel")}</button>
          ${readOnly ? "" : `<button type="submit">${tr("Speichern", "Save")}</button>`}
        </div>
      </div>
    </form>`;
  }

  _renderPriceChanges(item, dis) {
    const changes = item.price_changes || [];
    return `<details ${changes.length ? "open" : ""}>
      <summary>${tr("Preisänderungen", "Price changes")}${changes.length ? ` (${changes.length})` : ""}</summary>
      <p class="hint">${tr("Wird es teurer oder günstiger, trag hier ein, ab wann der neue Betrag gilt. Frühere Buchungen behalten ihren alten Betrag.", "If the price goes up or down, enter when the new amount applies. Earlier bookings keep their old amount.")}</p>
      ${changes
        .map(
          (c, idx) => `<div class="price-row">
            <label>${tr("ab", "from")}<input name="pc_from" type="date" required value="${esc(c.from || "")}" ${dis}></label>
            <label>${tr("neuer Betrag", "new amount")}<input name="pc_amount" ${this._amountAttrs()} required value="${this._amountValue(c.amount)}" ${dis}></label>
            ${dis ? "" : `<button type="button" class="danger small" data-action="price-remove" data-index="${idx}" aria-label="${tr("Preisänderung entfernen", "Remove price change")}">✕</button>`}
          </div>`
        )
        .join("")}
      ${dis ? "" : `<button type="button" class="secondary small" data-action="price-add">+ ${tr("Preisänderung", "Price change")}</button>`}
    </details>`;
  }

  _renderContractFields(d, dis) {
    const item = d.item;
    const c = item.contract || {};
    const hasContract = d.hasContract ?? Boolean(c.end);
    const info = item.contract_info;
    return `<details ${hasContract ? "open" : ""}>
      <summary>${tr("Vertrag und Kündigung", "Contract and cancellation")}${info && !info.ended ? ` · ${tr("kündbar bis", "cancel by")} ${shortDate(info.cancel_by)}` : ""}</summary>
      <label class="check"><input type="checkbox" name="has_contract" data-change="has_contract" ${hasContract ? "checked" : ""} ${dis}> ${tr("Vertragslaufzeit erfassen", "Track contract term")}</label>
      ${hasContract ? `<div class="grid">
        <label>${tr("Vertrag läuft bis", "Contract runs until")}<input name="contract_end" type="date" required value="${esc(c.end || "")}" ${dis}></label>
        <label>${tr("Kündigungsfrist", "Notice period")}<span class="inline-fields"><input name="notice" type="number" min="0" max="365" value="${c.notice ?? 1}" ${dis}><select name="notice_unit" ${dis}>
          ${Object.entries(NOTICE_UNITS).map(([k, v]) => `<option value="${k}" ${(c.notice_unit || "months") === k ? "selected" : ""}>${tr(v[0], v[1])}</option>`).join("")}
        </select></span></label>
        <label>${tr("Verlängert sich danach um", "Then renews for")}<span class="inline-fields"><input name="renew" type="number" min="0" max="365" value="${c.renew ?? c.renew_months ?? 12}" ${dis}><select name="renew_unit" ${dis}>
          ${Object.entries(NOTICE_UNITS).map(([k, v]) => `<option value="${k}" ${(c.renew_unit || "months") === k ? "selected" : ""}>${tr(v[0], v[1])}</option>`).join("")}
        </select></span></label>
        <p class="hint full">${tr("0 heißt: Der Vertrag endet und verlängert sich nicht.", "0 means: the contract ends and does not renew.")} ${info ? (info.ended ? tr(`Der Vertrag ist am ${shortDate(info.end)} ausgelaufen.`, `The contract ended on ${shortDate(info.end)}.`) : tr(`Nächstes Vertragsende ${shortDate(info.end)}, kündigen spätestens am <b>${shortDate(info.cancel_by)}</b>.`, `Next contract end ${shortDate(info.end)}, cancel by <b>${shortDate(info.cancel_by)}</b> at the latest.`)) : ""}</p>
      </div>` : ""}
    </details>`;
  }

  _renderNotice(d) {
    return `<div>
      <h2>${esc(d.title)}</h2>
      <p>${esc(d.text)}</p>
      <div class="dialog-actions"><span></span><div><button type="button" data-action="close">OK</button></div></div>
    </div>`;
  }

  _renderConfirmForm(d) {
    const item = this._state.items.find((i) => i.id === d.item_id);
    const rolling = item?.schedule?.frequency === "rolling";
    const future = d.date > iso(today());
    const booked = d.status === "booked";
    const hint = booked
      ? tr("Diese Buchung ist als gebucht bestätigt.", "This booking is confirmed as booked.")
      : future
        ? tr(
            `Geplant für ${fmtDate(d.date)}. Hast du schon einen festen Termin? Dann Datum und Betrag anpassen und als Termin festlegen.${rolling ? " Alle weiteren Termine rücken danach automatisch nach." : " Das verschiebt nur diese eine Buchung."}`,
            `Planned for ${fmtDate(d.date)}. Already have a fixed date? Adjust date and amount and set it as scheduled.${rolling ? " All later dates move along automatically." : " This only moves this one booking."}`
          )
        : tr(`Fällig am ${fmtDate(d.date)}. Ist die Buchung so auf dem Konto angekommen?`, `Due on ${fmtDate(d.date)}. Did the booking reach the account like this?`);
    return `<form data-form="confirm">
      <h2>${esc(item?.name || tr("Buchung", "Booking"))}</h2>
      <p class="hint">${hint}</p>
      <div class="grid">
        <label>${tr("Datum", "Date")}<input name="actual_date" type="date" required value="${esc(d.date)}"></label>
        <label>${tr("Betrag", "Amount")}<input name="actual_amount" ${this._amountAttrs()} value="${this._amountValue(d.amount)}"></label>
      </div>
      <div class="dialog-actions">
        <div>
          ${item ? `<button type="button" class="secondary" data-action="edit-item" data-item="${esc(item.id)}">${tr("Posten öffnen", "Open entry")}</button>` : ""}
          ${d.status ? `<button type="button" class="secondary" data-action="reset-confirm">${tr("Bestätigung zurücksetzen", "Reset confirmation")}</button>` : ""}
          ${d.planned && !booked ? `<button type="button" class="secondary" data-action="plan-clear">${tr("Termin entfernen", "Remove date")}</button>` : ""}
        </div>
        <div>
          ${booked ? "" : `<button type="button" class="${future ? "" : "secondary"}" data-action="plan-save">${d.planned ? tr("Termin ändern", "Change date") : tr("Als Termin festlegen", "Set as scheduled")}</button>`}
          <button type="button" class="secondary" data-action="confirm-skip">${tr("Ausgefallen", "Skipped")}</button>
          <button type="submit" class="${future && !booked ? "secondary" : ""}">${tr("Gebucht", "Booked")}</button>
        </div>
      </div>
    </form>`;
  }

  // ---------------------------------------------------------------- events

  _readItemForm(form) {
    const f = new FormData(form);
    const salaryBox = form.querySelector('[name="salary_cycle"]');
    if (salaryBox && !salaryBox.disabled) this._dialog.salaryCycle = salaryBox.checked;
    const preset = FREQUENCY_PRESETS.find((p) => p.key === f.get("preset"));
    const schedule = { frequency: preset.frequency, interval: preset.interval || Number(f.get("interval")) || 1, dates: [] };
    if (preset.key === "monthly_weekday") {
      schedule.weekday = Number(f.get("weekday") ?? 3);
      schedule.week = Number(f.get("week") ?? -1);
    }
    if (preset.key === "rolling") {
      schedule.unit = f.get("unit") || "months";
      schedule.learn = f.get("learn") === "on";
    }
    const froms = f.getAll("pc_from");
    const amounts = f.getAll("pc_amount");
    const price_changes = froms.map((from, i) => ({ from, amount: this._parsedAmount(amounts[i]) }));
    const contract = f.get("has_contract")
      ? { end: f.get("contract_end") || "", notice: Number(f.get("notice") || 0), notice_unit: f.get("notice_unit") || "months", renew: Number(f.get("renew") || 0), renew_unit: f.get("renew_unit") || "months" }
      : null;
    if (preset.key === "fixed_dates") {
      schedule.dates = String(f.get("dates") || "")
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map((part) => {
          const [day, month] = part.split(".").filter(Boolean);
          return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        });
    }
    return {
      ...this._dialog.item,
      name: f.get("name"),
      direction: f.get("direction"),
      amount: this._parsedAmount(f.get("amount")),
      category: f.get("category"),
      icon: f.get("icon"),
      start_date: f.get("start_date"),
      end_date: f.get("has_end") ? f.get("end_date") || null : null,
      schedule,
      amount_variance_pct: Number(f.get("amount_variance_pct") || 0),
      date_tolerance_days: Number(f.get("date_tolerance_days") || 0),
      certainty: f.get("certainty") || null,
      weekend_shift: f.get("weekend_shift") || null,
      household_id: f.get("household_id") || null,
      note: f.get("note"),
      price_changes,
      contract,
    };
  }

  async _suggest(input) {
    const box = input.closest(".suggest-field")?.querySelector(".suggest");
    if (!box) return;
    const query = input.value;
    let matches;
    if (input.name === "icon") {
      // Emoji or other non-MDI text: no suggestions.
      if (!/^[a-z0-9:\- ]+$/i.test(query.trim())) {
        box.hidden = true;
        return;
      }
      const list = await loadIconList();
      if (input.value !== query || this.shadowRoot.activeElement !== input) return;
      matches = searchIcons(list, query).map((icon) => [icon, icon, icon.slice(4)]);
    } else {
      const q = query.trim().toLowerCase();
      const iconOf = {};
      for (const item of this._state?.items || []) {
        if (item.category && item.icon && !iconOf[item.category]) iconOf[item.category] = item.icon;
      }
      matches = ((LANG === "de" ? this._state?.categories : this._state?.categories_en) || this._state?.categories || [])
        .filter((c) => c.toLowerCase().includes(q))
        .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)) || a.localeCompare(b, LANG))
        .map((c) => [c, iconOf[c] || "mdi:tag-outline", c]);
    }
    if (!matches.length || (matches.length === 1 && matches[0][0] === query.trim())) {
      box.hidden = true;
      return;
    }
    box.innerHTML = matches
      .map(([value, icon, label]) => `<button type="button" data-action="pick-suggest" data-value="${esc(value)}" title="${esc(value)}">${this._icon(icon, 22)}<span>${esc(label)}</span></button>`)
      .join("");
    box.hidden = false;
  }

  _pickSuggestion(input, value) {
    input.value = value;
    const field = input.closest(".suggest-field");
    const preview = field?.querySelector(".icon-preview");
    if (preview) preview.innerHTML = this._icon(value, 20);
    const box = field?.querySelector(".suggest");
    if (box) box.hidden = true;
  }
}
