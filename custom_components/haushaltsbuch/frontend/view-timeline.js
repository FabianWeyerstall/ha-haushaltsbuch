/* Haushaltsbuch panel – Tabs „Zeitleiste“ and „Kalender“: balance card, day entries, calendar month and day list.
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { tr, fmtDate, monthName, weekdayName, CERTAINTY, shortDate, esc, iso, today } from "./format.js";
import { scheduleLabel } from "./schedule.js";

export class TimelineView {
  _renderBalanceCard() {
    const b = this._scopeBalance();
    const days = this._view === "timeline" ? this._forecast?.days : this._calendar?.days;
    const last = days && days.length ? days[days.length - 1] : null;
    const known = b.balance !== null && b.balance !== undefined;
    return `<div class="card balance">
      <div>
        <div class="label">${this._isHousehold() ? tr("Haushaltskonto", "Household account") : tr("Mein Kontostand", "My balance")}</div>
        <div class="big">${known ? this._money(b.balance) : "—"}</div>
        <div class="sub">${known ? `${tr("Stand", "As of")} ${fmtDate(b.balance_date)}` : tr("Noch kein Kontostand hinterlegt", "No balance entered yet")}</div>
      </div>
      ${known && last && last.balance_likely !== null ? `<div>
        <div class="label">${tr("Am", "On")} ${fmtDate(last.date)}</div>
        <div class="big ${last.balance_likely < 0 ? "neg" : ""}">${this._money(last.balance_likely)}</div>
        <div class="sub">${tr("vorsichtig", "cautious")}: ${this._money(last.balance_sure)}</div>
      </div>` : ""}
      <button class="secondary" data-action="edit-balance">${tr("Kontostand setzen", "Set balance")}</button>
    </div>`;
  }

  _renderEntry(e, { showBalance = false, confirm = false, special = null } = {}) {
    const owner = this._isHousehold() ? `<span class="owner">${esc(e.owner_name)}</span>` : "";
    const status = e.budget ? `<span class="chip budget">Budget</span>` : e.status === "booked" ? `<span class="chip booked">${tr("gebucht", "booked")}</span>` : e.status === "skipped" ? `<span class="chip skipped">${tr("ausgefallen", "skipped")}</span>` : e.planned ? `<span class="chip planned">${tr("Termin", "scheduled")}</span>` : this._chip(e.certainty);
    return `<div class="entry ${e.status === "skipped" ? "skipped-row" : ""}" data-action="${e.budget ? "edit-item" : "open-entry"}" data-item="${esc(e.item_id)}" data-due="${esc(e.due_date)}" data-amount="${Math.abs(e.amount)}" data-date="${esc(e.date)}" data-status="${esc(e.status ?? "")}" data-planned="${e.planned ? "1" : ""}">
      <div class="entry-icon">${this._icon(e.icon)}</div>
      <div class="entry-main">
        <div class="entry-name">${esc(e.name)}</div>
        <div class="entry-meta">${special ? `<span class="chip special">★ ${esc(scheduleLabel(special))}</span> ` : ""}${esc(e.category)} ${owner} ${status}</div>
      </div>
      <div class="entry-amount ${e.amount < 0 ? "neg" : "pos"}">${this._money(e.amount, true)}</div>
      ${confirm ? `<div class="entry-actions">
        <button class="small" data-action="quick-confirm" data-status="booked" data-item="${esc(e.item_id)}" data-due="${esc(e.due_date)}">${tr("gebucht", "booked")}</button>
        <button class="small secondary" data-action="quick-confirm" data-status="skipped" data-item="${esc(e.item_id)}" data-due="${esc(e.due_date)}">${tr("ausgefallen", "skipped")}</button>
      </div>` : ""}
    </div>`;
  }

  _renderTimeline() {
    const allDays = this._forecast?.days || [];
    const days = allDays.filter((d) => d.entries.length);
    const gaps = this._budgetGaps(allDays, days, this._forecast?.balance_date);
    const ranges = [7, 30, 90];
    const pending = this._pending.length
      ? `<div class="card">
          <h3>${tr("Zu bestätigen", "To confirm")}</h3>
          <div class="row-between">
            <p class="hint">${tr("Diese Buchungen waren in den letzten drei Wochen fällig. Bestätigen hilft der App, die Sicherheit besser einzuschätzen.", "These bookings were due in the last three weeks. Confirming them helps the app judge how certain future bookings are.")}</p>
            ${this._pending.length > 1 ? `<button class="small" data-action="confirm-all">${tr(`Alle ${this._pending.length} gebucht`, `All ${this._pending.length} booked`)}</button>` : ""}
          </div>
          ${this._pending.map((e) => `<div class="pending-date">${this._dateLabel(e.date)}</div>${this._renderEntry(e, { confirm: true, special: this._specialOf(e) })}`).join("")}
        </div>`
      : "";
    const list = days.length
      ? days
          .map(
            (d) => `<div class="day">
              <div class="day-head"><span>${this._dateLabel(d.date)}</span>${d.balance_likely !== null ? `<span class="day-balance ${d.balance_likely < 0 ? "neg" : ""}">${this._money(d.balance_likely)}</span>` : ""}</div>
              ${d.entries.map((e) => this._renderEntry(e, { special: this._specialOf(e) })).join("")}
              ${this._renderBudgetRow(gaps[d.date])}
            </div>`
          )
          .join("")
      : `<div class="empty">${tr("In diesem Zeitraum ist nichts fällig.", "Nothing is due in this period.")}${this._state.items.length ? "" : tr(" Lege unter „Posten“ deine ersten Einträge an.", " Add your first entries under “Entries”.")}</div>`;
    const deadlines = this._scopeItems()
      .filter((i) => i.contract_info && !i.contract_info.ended && i.contract_info.days_left <= 60)
      .sort((a, b) => a.contract_info.cancel_by.localeCompare(b.contract_info.cancel_by));
    const deadlineCard = deadlines.length
      ? `<div class="card">
          <h3>${tr("Kündigungsfristen", "Cancellation deadlines")}</h3>
          <p class="hint">${tr("Verträge, die du in den nächsten 60 Tagen kündigen müsstest, wenn du sie loswerden willst.", "Contracts you would have to cancel within the next 60 days if you want to get rid of them.")}</p>
          ${deadlines
            .map((i) => {
              const c = i.contract_info;
              return `<div class="entry" data-action="edit-item" data-item="${esc(i.id)}">
                <div class="entry-icon">${this._icon(i.icon)}</div>
                <div class="entry-main">
                  <div class="entry-name">${esc(i.name)}</div>
                  <div class="entry-meta">${tr("Vertragsende", "Contract ends")} ${shortDate(c.end)}${c.renews ? tr(", verlängert sich sonst", ", renews otherwise") : ""}</div>
                </div>
                <div class="deadline ${c.days_left <= 14 ? "urgent" : ""}">${tr("bis", "by")} ${shortDate(c.cancel_by)}<small>${c.days_left === 0 ? tr("heute", "today") : tr(`noch ${c.days_left} Tage`, `${c.days_left} days left`)}</small></div>
              </div>`;
            })
            .join("")}
        </div>`
      : "";
    const budgetMonthly = this._scopeItems()
      .filter((i) => i.schedule?.frequency === "budget" && i.direction === "expense" && (!i.end_date || i.end_date >= iso(today())))
      .reduce((a, i) => a + Number(i.current_amount ?? i.amount), 0);
    return `${this._renderBudgetCard()}${pending}${deadlineCard}
      <div class="card">
        <div class="row-between">
          <h3>${tr(`Die nächsten ${this._range} Tage`, `Next ${this._range} days`)}</h3>
          <div class="segmented">${ranges.map((r) => `<button class="${r === this._range ? "active" : ""}" data-action="range" data-range="${r}">${r} ${tr("Tage", "days")}</button>`).join("")}</div>
        </div>
        <p class="hint">${tr("Rechts neben jedem Tag steht der erwartete Kontostand mit sicheren und wahrscheinlichen Posten. Unsichere Posten werden gezeigt, aber nicht eingerechnet.", "Next to each day is the expected balance with certain and likely entries. Uncertain entries are shown but not counted.")}${budgetMonthly ? tr(` Budgets (${this._money(budgetMonthly)} pro Monat) sind eingerechnet: was noch übrig ist, verteilt auf die restlichen Tage.`, ` Budgets (${this._money(budgetMonthly)} per month) are included: what is left, spread over the remaining days.`) : ""}</p>
        ${list}
      </div>`;
  }

  _renderCalendar() {
    const month = this._month;
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const byDate = Object.fromEntries((this._calendar?.days || []).map((d) => [d.date, d]));
    const t = iso(today());
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(`<div class="cal-cell blank"></div>`);
    for (let day = 1; day <= daysInMonth; day++) {
      const key = iso(new Date(month.getFullYear(), month.getMonth(), day));
      const entries = (byDate[key]?.entries || []).filter((e) => e.status !== "skipped");
      const sum = entries.reduce((acc, e) => acc + e.amount, 0);
      cells.push(`<button class="cal-cell ${key === t ? "today" : ""} ${key === this._selectedDay ? "selected" : ""}" data-action="select-day" data-day="${key}">
        <span class="cal-day">${day}</span>
        <span class="cal-icons">${entries.slice(0, 4).map((e) => `<span class="cal-dot" style="--chip:${CERTAINTY[e.certainty]?.color}">${this._icon(e.icon, 16)}</span>`).join("")}${entries.length > 4 ? `<span class="more">+${entries.length - 4}</span>` : ""}</span>
        ${entries.length ? `<span class="cal-sum ${sum < 0 ? "neg" : "pos"}">${this._money(sum, true)}</span>` : ""}
      </button>`);
    }
    const selected = this._selectedDay && byDate[this._selectedDay];
    return `<div class="card">
      <div class="row-between">
        <button class="icon-button" data-action="month" data-delta="-1" aria-label="${tr("Vorheriger Monat", "Previous month")}">‹</button>
        <h3>${monthName(month.getMonth())} ${month.getFullYear()}</h3>
        <button class="icon-button" data-action="month" data-delta="1" aria-label="${tr("Nächster Monat", "Next month")}">›</button>
      </div>
      <div class="cal-grid">${[0, 1, 2, 3, 4, 5, 6].map((w) => `<div class="cal-head">${weekdayName(w)}</div>`).join("")}${cells.join("")}</div>
    </div>
    ${!selected ? this._renderMonthList() : ""}
    ${selected ? `<div class="card"><div class="row-between"><h3>${this._dateLabel(this._selectedDay)}</h3><button class="secondary small" data-action="select-day" data-day="">${tr("ganzer Monat", "whole month")}</button></div>
      ${selected.entries.length ? selected.entries.map((e) => this._renderEntry(e, { special: this._specialOf(e) })).join("") : `<div class="empty">${tr("Nichts fällig.", "Nothing due.")}</div>`}
      ${selected.balance_likely !== null ? `<p class="hint">${tr("Erwarteter Kontostand am Ende des Tages", "Expected balance at the end of the day")}: ${this._money(selected.balance_likely)} (${tr("vorsichtig", "cautious")}: ${this._money(selected.balance_sure)})</p>` : ""}
    </div>` : ""}`;
  }

  _renderMonthList() {
    const allDays = this._calendar?.days || [];
    const days = allDays.filter((d) => d.entries.some((e) => e.status !== "skipped"));
    const t = iso(today());
    const gaps = this._budgetGaps(allDays, days, this._calendar?.balance_date);
    return `<div class="card">
      <h3>${tr(`Alle Buchungen im ${monthName(this._month.getMonth())}`, `All bookings in ${monthName(this._month.getMonth())}`)}</h3>
      <p class="hint">${tr("Tippe oben auf einen Tag, um nur diesen Tag zu sehen.", "Tap a day above to see only that day.")}</p>
      ${days.length
        ? days
            .map(
              (d) => `<div class="day ${d.date < t ? "past" : ""}">
                <div class="day-head"><span>${this._dateLabel(d.date)}</span>${d.balance_likely !== null && d.date >= t ? `<span class="day-balance ${d.balance_likely < 0 ? "neg" : ""}">${this._money(d.balance_likely)}</span>` : ""}</div>
                ${d.entries.map((e) => this._renderEntry(e, { special: this._specialOf(e) })).join("")}
                ${d.date >= t ? this._renderBudgetRow(gaps[d.date]) : ""}
              </div>`
            )
            .join("")
        : `<div class="empty">${tr("In diesem Monat ist nichts fällig.", "Nothing is due this month.")}</div>`}
    </div>`;
  }
}
