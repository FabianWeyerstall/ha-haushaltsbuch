/* Haushaltsbuch panel – Tab „Übersicht“: key figures, pie chart, splits, help bubbles.
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { LANG, tr, fmtDate, certaintyLabel, FREQUENCY_PRESETS, esc, iso, today } from "./format.js";
import { presetOf, scheduleLabel, monthlyEquivalent } from "./schedule.js";

export class DashboardView {
  // ------------------------------------------------------------- dashboard

  _renderDashboard() {
    const items = this._scopeItems();
    const rows = this._summary || [];
    const days = this._trend?.days || [];
    const b = this._scopeBalance();
    const known = b.balance !== null && b.balance !== undefined;
    const itemsById = Object.fromEntries(this._state.items.map((i) => [i.id, i]));
    const active = items.filter((i) => !i.end_date || i.end_date >= iso(today()));
    const monthlyIn = active.filter((i) => i.direction === "income").reduce((a, i) => a + monthlyEquivalent(i), 0);
    const monthlyOut = active.filter((i) => i.direction === "expense").reduce((a, i) => a + monthlyEquivalent(i), 0);
    const free = monthlyIn - monthlyOut;
    const monthEnd = iso(new Date(today().getFullYear(), today().getMonth() + 1, 0));
    const endDay = [...days].reverse().find((d) => d.date <= monthEnd && d.balance_likely !== null);
    const salary = this._salaryItem();
    const todayIso = iso(today());
    const payIndex = salary ? days.findIndex((d) => d.date > todayIso && d.entries.some((e) => e.item_id === salary.id && e.status !== "skipped")) : -1;
    const beforePay = payIndex > 0 && days[payIndex - 1].balance_likely !== null ? days[payIndex - 1] : null;
    const lowest = days.filter((d) => d.balance_likely !== null).reduce((m, d) => (m && m.balance_likely <= d.balance_likely ? m : d), null);
    const tile = (label, value, sub = "", cls = "", help = "") =>
      `<div class="kpi"><div class="label">${label}${help ? this._help(help) : ""}</div><div class="kpi-value ${cls}">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
    const kpis = `<div class="card"><div class="kpis">
      ${tile(this._isHousehold() ? tr("Haushaltskonto", "Household account") : tr("Kontostand", "Balance"), known ? this._money(b.balance) : "—", known ? `${tr("Stand", "As of")} ${fmtDate(b.balance_date)}` : tr("noch nicht gesetzt", "not set yet"))}
      ${salary
        ? tile(tr("Vor dem nächsten Gehalt", "Before next payday"), beforePay ? this._money(beforePay.balance_likely) : "—", beforePay ? `${tr("am", "on")} ${fmtDate(beforePay.date)} · ${tr("vorsichtig", "cautious")}: ${this._money(beforePay.balance_sure)}` : "", beforePay && beforePay.balance_likely < 0 ? "neg" : "", tr(`Was am Tag vor dem nächsten Gehalt (${salary.name}) übrig ist, wenn alles wie erwartet kommt. Dann sind alle Abbuchungen des Monats schon runter.`, `What is left the day before the next salary (${salary.name}) if everything comes as expected. By then all of the month's debits have gone out.`))
        : tile(tr("Erwartet zum Monatsende", "Expected at month end"), endDay ? this._money(endDay.balance_likely) : "—", endDay ? `${tr("vorsichtig", "cautious")}: ${this._money(endDay.balance_sure)}` : "", endDay && endDay.balance_likely < 0 ? "neg" : "", tr("Kontostand am letzten Tag dieses Monats, wenn alles wie erwartet kommt. Kommt dein Gehalt am Monatsende, markiere es im Posten als „Mein Monat beginnt mit dieser Einnahme“, dann steht hier der Stand vor dem nächsten Gehalt.", "Balance on the last day of this month if everything comes as expected. If your salary arrives at the month end, mark it as “My month starts with this income” to see the balance before the next payday here."))}
      ${tile(tr("Einnahmen pro Monat", "Income per month"), this._money(monthlyIn), tr("regelmäßig, umgerechnet", "recurring, converted"), "pos", tr("Alle wiederkehrenden Einnahmen auf einen Monat umgerechnet. Einmalige wie ein Bonus zählen nicht.", "All recurring income converted to one month. One-offs such as a bonus are not included."))}
      ${tile(tr("Ausgaben pro Monat", "Expenses per month"), this._money(monthlyOut), tr("inklusive Budgets und Jahresposten", "incl. budgets and yearly entries"), "neg", tr("Alle wiederkehrenden Ausgaben auf einen Monat umgerechnet, auch jährliche (geteilt durch 12) und Budgets.", "All recurring expenses converted to one month, yearly ones divided by 12, budgets included."))}
      ${tile(tr("Bleibt pro Monat", "Left per month"), this._money(free, true), monthlyIn > 0 ? tr(`${Math.round((free / monthlyIn) * 100)} % der Einnahmen`, `${Math.round((free / monthlyIn) * 100)} % of income`) : "", free < 0 ? "neg" : "pos", tr("Einnahmen pro Monat minus Ausgaben pro Monat. So viel kannst du im Schnitt sparen.", "Income per month minus expenses per month: what you can save on average."))}
      ${tile(tr("Tiefster Stand (90 Tage)", "Lowest balance (90 days)"), lowest ? this._money(lowest.balance_likely) : "—", lowest ? fmtDate(lowest.date) : "", lowest && lowest.balance_likely < 0 ? "neg" : "", tr("Der niedrigste erwartete Kontostand in den nächsten 90 Tagen, meist kurz vor dem Gehalt.", "The lowest expected balance in the next 90 days, usually just before payday."))}
    </div></div>`;
    return kpis + this._renderBudgetCard() + this._renderCategoryPie(rows, monthlyIn) + this._renderSpendSplit(rows, itemsById) + this._renderCertaintySplit(rows) + this._renderFrequencySplit(active) + this._renderTopItems(active) + this._renderUpcomingSpecials(rows, itemsById);
  }

  _showHelp(el) {
    this._hideHelp();
    const tip = document.createElement("div");
    tip.className = "help-tip";
    tip.textContent = el.dataset.help;
    this.shadowRoot.appendChild(tip);
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    const below = r.bottom + 6 + tip.offsetHeight < window.innerHeight;
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? r.bottom + 6 : r.top - tip.offsetHeight - 6}px`;
    this._helpTip = tip;
    this._helpFor = el;
    this._helpShownAt = Date.now();
  }

  _hideHelp() {
    this._helpTip?.remove();
    this._helpTip = null;
    this._helpFor = null;
  }

  /** Small ⓘ that explains a figure on hover, focus or tap. */
  _help(text) {
    return `<span class="help" tabindex="0" role="note" aria-label="${esc(text)}" data-help="${esc(text)}">ⓘ</span>`;
  }

  /** Add one booking to a per-item breakdown. */
  _addDetail(map, e, value) {
    const d = (map[e.item_id] ||= { id: e.item_id, name: e.name, icon: e.icon, value: 0, count: 0 });
    d.value += value;
    d.count += 1;
  }

  /** The entries behind one part of a figure, largest first. */
  _renderDetails(details, { unit = "month", note = "" } = {}) {
    const list = Object.values(details || {}).sort((a, b) => b.value - a.value);
    if (!list.length) return `<div class="details"><div class="empty">${tr("Keine Posten.", "No entries.")}</div></div>`;
    return `<div class="details">
      ${note ? `<p class="hint">${note}</p>` : ""}
      ${list
        .map(
          (d) => `<div class="detail-row" data-action="edit-item" data-item="${esc(d.id)}">
            <span class="detail-icon">${this._icon(d.icon, 18)}</span>
            <div class="detail-name">${esc(d.name)}<small>${d.sub ?? (d.count === 1 ? tr("1 Buchung", "1 booking") : tr(`${d.count} Buchungen`, `${d.count} bookings`))}</small></div>
            <div class="detail-value">${this._money(d.value)}<small>${unit === "month" ? tr("pro Monat", "per month") : unit === "total" ? tr("zusammen", "in total") : ""}</small></div>
          </div>`
        )
        .join("")}
    </div>`;
  }

  /**
   * Thin segmented bar with a list of parts below (name, amount, share).
   * Tapping a part opens the entries behind it.
   */
  _splitBar(group, parts, total, opts = {}) {
    const shown = parts.filter((p) => p.value > 0);
    if (!shown.length || total <= 0) return `<div class="empty">${tr("Keine Daten.", "No data.")}</div>`;
    const open = (p) => this._dashOpen === `${group}:${p.key}`;
    return `<div class="split" role="img" aria-label="${esc(shown.map((p) => `${p.label} ${Math.round((p.value / total) * 100)} %`).join(", "))}">
        ${shown.map((p) => `<span class="${p.cls} ${open(p) ? "active" : ""}" style="flex:${p.value}" data-action="dash-toggle" data-key="${group}:${p.key}" title="${esc(p.label)}: ${Math.round((p.value / total) * 100)} %"></span>`).join("")}
      </div>
      <div class="split-list">
        ${shown
          .map(
            (p) => `<div class="split-row clickable ${open(p) ? "open" : ""}" data-action="dash-toggle" data-key="${group}:${p.key}" role="button" aria-expanded="${open(p)}" tabindex="0">
              <i class="swatch ${p.cls}"></i>
              <div class="split-name">${esc(p.label)}${p.help ? this._help(p.help) : ""}${p.hint ? `<small>${p.hint}</small>` : ""}</div>
              <div class="split-value">${this._money(p.value)}<small>${Math.round((p.value / total) * 100)} %</small></div>
              <span class="chevron">${open(p) ? "▾" : "▸"}</span>
            </div>${open(p) ? this._renderDetails(p.details, opts) : ""}`
          )
          .join("")}
      </div>`;
  }

  _renderCategoryPie(rows, monthlyIn = 0) {
    if (!rows.length) return "";
    const totals = {};
    const details = {};
    for (const r of rows) {
      for (const e of r.entries || []) {
        if (e.amount >= 0 || e.certainty === "unsicher" || e.status === "skipped") continue;
        const cat = e.category || tr("Sonstiges", "Other");
        totals[cat] = (totals[cat] || 0) - e.amount / rows.length;
        this._addDetail((details[cat] ||= {}), e, -e.amount / rows.length);
      }
    }
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return "";
    // Five named slices in a fixed colour order, everything else folds into "Other".
    const parts = sorted.slice(0, 5).map(([label, value], i) => ({ key: label, label, value, cls: `p${i + 1}`, details: details[label] }));
    const rest = sorted.slice(5);
    if (rest.length) {
      const restDetails = {};
      for (const [cat] of rest) Object.assign(restDetails, details[cat]);
      parts.push({ key: "__other", label: tr(`Weitere (${rest.length})`, `Others (${rest.length})`), value: rest.reduce((a, [, v]) => a + v, 0), cls: "p-other", details: restDetails });
    }
    const total = parts.reduce((a, p) => a + p.value, 0);
    const R0 = 70, R1 = 44, C = 80;
    let angle = -Math.PI / 2;
    const slices = parts.map((p) => {
      const sweep = (p.value / total) * Math.PI * 2;
      const a0 = angle, a1 = angle + sweep;
      angle = a1;
      const attrs = `class="${p.cls} ${this._dashOpen === `cat:${p.key}` ? "active" : ""}" data-action="dash-toggle" data-key="cat:${esc(p.key)}"`;
      if (sweep >= Math.PI * 2 - 1e-6) return `<circle ${attrs} cx="${C}" cy="${C}" r="${(R0 + R1) / 2}" fill="none" stroke-width="${R0 - R1}"><title>${esc(p.label)}</title></circle>`;
      const pt = (r, a) => `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
      const large = sweep > Math.PI ? 1 : 0;
      return `<path ${attrs} d="M${pt(R0, a0)}A${R0},${R0} 0 ${large} 1 ${pt(R0, a1)}L${pt(R1, a1)}A${R1},${R1} 0 ${large} 0 ${pt(R1, a0)}Z"><title>${esc(p.label)}: ${Math.round((p.value / total) * 100)} %</title></path>`;
    });
    const open = (p) => this._dashOpen === `cat:${p.key}`;
    return `<div class="card">
      <h3>${tr("Wohin das meiste Geld fließt", "Where most of the money goes")}${this._help(tr("Alle Ausgaben der nächsten 12 Monate nach Kategorie, geteilt durch 12. So siehst du, was ein durchschnittlicher Monat pro Kategorie kostet. Unsichere und ausgefallene Buchungen zählen nicht.", "All expenses of the next 12 months by category, divided by 12: what an average month costs per category. Uncertain and skipped bookings are left out."))}</h3>
      <p class="hint">${tr("Durchschnitt pro Monat. Tippe auf eine Kategorie, um die Posten darin zu sehen.", "Average per month. Tap a category to see its entries.")}</p>
      <div class="pie-wrap">
        <div class="pie">
          <svg viewBox="0 0 160 160" width="180" height="180" role="img" aria-label="${esc(parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)} %`).join(", "))}">${slices.join("")}</svg>
          <div class="pie-center"><small>${tr("pro Monat", "per month")}</small>${this._money(total)}</div>
        </div>
        ${monthlyIn > 0 ? `<p class="hint income-share">${tr(
          `Zusammen <b>${this._money(total)}</b> pro Monat, das sind <b>${Math.round((total / monthlyIn) * 100)} % deines Einkommens</b> (${this._money(monthlyIn)}). Die Prozente in der Liste sind Anteile an den Ausgaben.`,
          `Together <b>${this._money(total)}</b> per month, that is <b>${Math.round((total / monthlyIn) * 100)} % of your income</b> (${this._money(monthlyIn)}). The percentages in the list are shares of spending.`
        )}</p>` : ""}
        <div class="split-list pie-list">
          ${parts
            .map(
              (p) => `<div class="split-row clickable ${open(p) ? "open" : ""}" data-action="dash-toggle" data-key="cat:${esc(p.key)}" role="button" aria-expanded="${open(p)}" tabindex="0">
                <i class="swatch ${p.cls}"></i><div class="split-name">${esc(p.label)}</div>
                <div class="split-value">${this._money(p.value)}<small>${Math.round((p.value / total) * 100)} %</small></div>
                <span class="chevron">${open(p) ? "▾" : "▸"}</span>
              </div>${open(p) ? this._renderDetails(p.details, { note: this._shareNote(p.value, total, monthlyIn) }) : ""}`
            )
            .join("")}
        </div>
      </div>
    </div>`;
  }

  // "47 % of your spending · 30 % of your income" for one opened part.
  _shareNote(value, total, monthlyIn) {
    const ofSpend = Math.round((value / total) * 100);
    if (!(monthlyIn > 0)) return tr(`${ofSpend} % deiner Ausgaben`, `${ofSpend} % of your spending`);
    const ofIncome = Math.round((value / monthlyIn) * 100);
    return tr(`<b>${ofSpend} % deiner Ausgaben</b> · <b>${ofIncome} % deines Einkommens</b>`, `<b>${ofSpend} % of your spending</b> · <b>${ofIncome} % of your income</b>`);
  }

  _renderSpendSplit(rows, itemsById) {
    if (!rows.length) return "";
    const sums = { regular: 0, budget: 0, special: 0 };
    const details = { regular: {}, budget: {}, special: {} };
    for (const r of rows) {
      for (const e of r.entries || []) {
        if (e.amount >= 0 || e.certainty === "unsicher" || e.status === "skipped") continue;
        const item = itemsById[e.item_id];
        const kind = e.budget || item?.schedule?.frequency === "budget" ? "budget" : this._isSpecial(item, e.amount) ? "special" : "regular";
        sums[kind] += -e.amount / rows.length;
        this._addDetail(details[kind], e, -e.amount / rows.length);
      }
    }
    const total = sums.regular + sums.budget + sums.special;
    return `<div class="card">
      <h3>${tr("Fixkosten, Sonderposten und Budgets", "Fixed costs, special entries and budgets")}</h3>
      <p class="hint">${tr("Was ein durchschnittlicher Monat kostet, aufgeteilt nach Art der Ausgabe. Tippe auf eine Zeile für die Posten dahinter.", "What an average month costs, split by kind of expense. Tap a row to see the entries behind it.")}</p>
      ${this._splitBar(
        "spend",
        [
          { key: "regular", label: tr("Laufende Fixkosten", "Regular fixed costs"), hint: tr("kommen jeden Monat", "due every month"), help: tr("Alles, was jeden Monat (oder öfter) abgebucht wird, z.B. Miete, Strom, Handy, Kredit.", "Everything debited every month (or more often), e.g. rent, electricity, phone, loan."), value: sums.regular, cls: "s1", details: details.regular },
          { key: "special", label: tr("Sonderposten, umgelegt", "Special entries, spread"), hint: tr("auf die Monate verteilt", "spread across the months"), help: tr("Posten, die nicht jeden Monat kommen (z.B. Versicherung jährlich, GEZ vierteljährlich). Ihre Summe über 12 Monate geteilt durch 12. So viel solltest du jeden Monat dafür zurücklegen.", "Entries that don't come every month (e.g. yearly insurance). Their 12-month sum divided by 12: what you should put aside each month."), value: sums.special, cls: "s2", details: details.special },
          { key: "budget", label: tr("Budgets", "Budgets"), hint: tr("variable Ausgaben", "variable spending"), help: tr("Monatsbudgets für Ausgaben ohne feste Termine, z.B. Lebensmittel oder Freizeit.", "Monthly budgets for spending without fixed dates, e.g. groceries or leisure."), value: sums.budget, cls: "s3", details: details.budget },
        ],
        total
      )}
    </div>`;
  }

  _renderCertaintySplit(rows) {
    if (!rows.length) return "";
    const sums = { sicher: 0, wahrscheinlich: 0, unsicher: 0 };
    const details = { sicher: {}, wahrscheinlich: {}, unsicher: {} };
    for (const r of rows) {
      for (const e of r.entries || []) {
        if (e.amount >= 0 || e.status === "skipped" || e.budget) continue;
        const key = e.certainty in sums ? e.certainty : "unsicher";
        sums[key] += -e.amount;
        this._addDetail(details[key], e, -e.amount);
      }
    }
    const total = sums.sicher + sums.wahrscheinlich + sums.unsicher;
    return `<div class="card">
      <h3>${tr("Wie sicher sind die Ausgaben?", "How certain are the expenses?")}${this._help(tr("Jede Buchung hat eine Sicherheitsstufe. Sie wird sicher, wenn du die letzten Buchungen pünktlich mit gleichem Betrag bestätigt hast. Unsicher heißt: schwankt stark, zuletzt ausgefallen oder läuft bald aus.", "Every booking has a certainty level. It becomes certain once the last bookings were confirmed on time with the same amount. Uncertain means it varies a lot, was skipped recently or ends soon."))}</h3>
      <p class="hint">${tr(`Alle einzelnen Ausgaben der nächsten ${rows.length} Monate zusammen (ohne Budgets). Tippe auf eine Stufe, um zu sehen, welche Posten dazugehören.`, `All single expenses of the next ${rows.length} months together (without budgets). Tap a level to see which entries belong to it.`)}</p>
      ${this._splitBar(
        "cert",
        [
          { key: "sicher", label: certaintyLabel("sicher"), hint: tr("pünktlich bestätigt", "confirmed on time"), value: sums.sicher, cls: "c-sure", details: details.sicher },
          { key: "wahrscheinlich", label: certaintyLabel("wahrscheinlich"), hint: tr("noch nicht oft genug bestätigt oder schwankend", "not confirmed often enough yet, or varying"), value: sums.wahrscheinlich, cls: "c-likely", details: details.wahrscheinlich },
          { key: "unsicher", label: certaintyLabel("unsicher"), hint: tr("zählt nicht im Kontostand", "not counted in the balance"), value: sums.unsicher, cls: "c-unsure", details: details.unsicher },
        ],
        total,
        { unit: "total", note: tr(`Summe der nächsten ${rows.length} Monate. Bestätige Buchungen in der Zeitleiste, damit sie sicher werden.`, `Sum of the next ${rows.length} months. Confirm bookings in the timeline to make them certain.`) }
      )}
    </div>`;
  }

  _renderFrequencySplit(items) {
    const groups = {};
    for (const i of items.filter((i) => i.direction === "expense")) {
      const v = monthlyEquivalent(i);
      if (!v) continue;
      const key = presetOf(i.schedule);
      const g = (groups[key] ||= { value: 0, items: {} });
      g.value += v;
      g.items[i.id] = { id: i.id, name: i.name, icon: i.icon, value: v, sub: `${this._moneyPlain(Number(i.current_amount ?? i.amount))} ${scheduleLabel(i)}` };
    }
    const list = Object.entries(groups).sort((a, b) => b[1].value - a[1].value);
    if (!list.length) return "";
    const max = list[0][1].value;
    const total = list.reduce((a, [, g]) => a + g.value, 0);
    return `<div class="card">
      <h3>${tr("Was jeder Turnus pro Monat kostet", "What each schedule costs per month")}${this._help(tr("Jeder Posten wird auf einen Monat umgerechnet: eine jährliche Versicherung von 120 € zählt mit 10 € pro Monat, eine vierteljährliche Rechnung von 60 € mit 20 €. So lassen sich monatliche, jährliche und gleitende Posten vergleichen.", "Every entry is converted to one month: a yearly insurance of 120 counts as 10 per month, a quarterly bill of 60 as 20. That makes monthly, yearly and rolling entries comparable."))}</h3>
      <p class="hint">${tr(`Deine Ausgaben gruppiert danach, wie oft sie kommen, umgerechnet auf einen Monat (zusammen ${this._moneyPlain(total)} pro Monat). Tippe auf eine Zeile für die Posten.`, `Your expenses grouped by how often they come, converted to one month (${this._moneyPlain(total)} per month in total). Tap a row for the entries.`)}</p>
      ${list
        .map(([key, g]) => {
          const open = this._dashOpen === `freq:${key}`;
          const count = Object.keys(g.items).length;
          return `<div class="cat-row clickable ${open ? "open" : ""}" data-action="dash-toggle" data-key="freq:${key}" role="button" aria-expanded="${open}" tabindex="0">
            <div class="cat-name">${esc(FREQUENCY_PRESETS.find((p) => p.key === key)[LANG].replace(/ \(.*\)$/, ""))}<small>${count} ${count === 1 ? tr("Posten", "entry") : tr("Posten", "entries")} · ${Math.round((g.value / total) * 100)} %</small></div>
            <div class="cat-bar"><span style="width:${(g.value / max) * 100}%"></span></div>
            <div class="cat-sum">${this._money(g.value)}<small>${tr("pro Monat", "per month")}</small></div>
          </div>${open ? this._renderDetails(g.items) : ""}`;
        })
        .join("")}
    </div>`;
  }

  _renderTopItems(items) {
    const list = items
      .filter((i) => i.direction === "expense")
      .map((i) => [i, monthlyEquivalent(i)])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (!list.length) return "";
    const max = list[0][1];
    return `<div class="card">
      <h3>${tr("Größte Ausgaben", "Largest expenses")}${this._help(tr("Die Posten mit dem höchsten Betrag pro Monat, umgerechnet wie oben. Antippen öffnet den Posten.", "The entries with the highest amount per month, converted as above. Tap to open the entry."))}</h3>
      <p class="hint">${tr("Die acht Posten, die pro Monat umgerechnet am meisten kosten.", "The eight entries that cost the most per month.")}</p>
      ${list
        .map(
          ([i, v]) => `<div class="cat-row clickable" data-action="edit-item" data-item="${esc(i.id)}">
            <div class="cat-name"><span class="cat-icon">${this._icon(i.icon, 18)}</span>${esc(i.name)}<small>${esc(scheduleLabel(i))}</small></div>
            <div class="cat-bar"><span style="width:${(v / max) * 100}%"></span></div>
            <div class="cat-sum">${this._money(v)}<small>${tr("pro Monat", "per month")}</small></div>
          </div>`
        )
        .join("")}
    </div>`;
  }

  _renderUpcomingSpecials(rows, itemsById) {
    const limit = iso(new Date(today().getFullYear(), today().getMonth() + 3, today().getDate()));
    const list = rows
      .flatMap((r) => r.entries || [])
      .filter((e) => e.date >= iso(today()) && e.date <= limit && e.status !== "skipped" && !e.budget && this._isSpecial(itemsById[e.item_id], e.amount))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length) return "";
    const sum = list.reduce((a, e) => a + e.amount, 0);
    return `<div class="card">
      <div class="row-between"><h3>${tr("Sonderposten der nächsten 3 Monate", "Special entries in the next 3 months")}${this._help(tr("Buchungen, die nicht jeden Monat kommen und deshalb auffallen, z.B. Jahresbeiträge oder ein Bonus. Was als Sonderposten zählt, stellst du im Tab Monate ein.", "Bookings that don't come every month and therefore stand out, e.g. yearly fees or a bonus. What counts as special is set in the Months tab."))}</h3><b class="${sum < 0 ? "neg" : "pos"}">${this._money(sum, true)}</b></div>
      ${list.map((e) => `<div class="pending-date">${this._dateLabel(e.date)}</div>${this._renderEntry({ owner_name: "", ...e }, { special: itemsById[e.item_id] })}`).join("")}
    </div>`;
  }
}
