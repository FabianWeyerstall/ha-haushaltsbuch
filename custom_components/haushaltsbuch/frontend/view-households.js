/* Haushaltsbuch panel – Tab „Haushalt“: households, balances, backups.
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { tr, DATE_LOCALE, esc, iso, today } from "./format.js";

export class HouseholdsView {
  _renderHouseholds() {
    const hs = this._state.households;
    return `<div class="card">
      <div class="row-between">
        <h3>${tr("Haushaltsbücher", "Households")}</h3>
        <button data-action="new-household">+ ${tr("Haushalt anlegen", "Add household")}</button>
      </div>
      <p class="hint">${tr("In einem Haushaltsbuch siehst du die Posten aller Mitglieder zusammen. Deine Posten bleiben privat, bis du sie beim Bearbeiten einem Haushalt zuordnest.", "A household shows the entries of all its members together. Your entries stay private until you assign them to a household while editing.")}</p>
    </div>
    ${hs.length ? hs
      .map(
        (h) => `<div class="card">
          <div class="row-between">
            <h3>${esc(h.name)}</h3>
            <div class="actions">
              ${h.is_creator ? `<button class="secondary" data-action="edit-household" data-id="${esc(h.id)}">${tr("Bearbeiten", "Edit")}</button>` : `<button class="secondary" data-action="leave-household" data-id="${esc(h.id)}">${tr("Verlassen", "Leave")}</button>`}
            </div>
          </div>
          <div class="entry-meta">${tr("Mitglieder", "Members")}: ${h.member_names.map(esc).join(", ")}</div>
          <label class="switch-row">
            <input type="checkbox" data-change="entities" data-id="${esc(h.id)}" ${h.entities ? "checked" : ""}>
            <span>${tr("Als Kalender und Sensoren in Home Assistant anlegen", "Create a calendar and sensors in Home Assistant")}<br><small>${tr("Diese Entitäten können alle Home-Assistant-Nutzer sehen.", "All Home Assistant users can see these entities.")}</small></span>
          </label>
        </div>`
      )
      .join("") : `<div class="card empty">${tr("Noch kein Haushaltsbuch.", "No household yet.")}</div>`}
    ${this._state.user.is_admin ? this._renderBackups() : ""}`;
  }

  _renderBackups() {
    const reasons = {
      manual: tr("von Hand", "manual"),
      csv_import: tr("vor CSV-Import", "before CSV import"),
      before_restore: tr("vor Wiederherstellen", "before restore"),
      before_update: tr("vor Update der Daten", "before data update"),
      upload: tr("hochgeladene Datei", "uploaded file"),
    };
    const list = this._backups?.backups || [];
    const when = (created) => {
      const d = new Date(created);
      return `${d.toLocaleDateString(DATE_LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" })}, ${d.toLocaleTimeString(DATE_LOCALE, { hour: "2-digit", minute: "2-digit" })}`;
    };
    return `<div class="card">
      <div class="row-between">
        <h3>${tr("Sicherungen", "Backups")}</h3>
        <button data-action="backup-create">${tr("Jetzt sichern", "Back up now")}</button>
      </div>
      <p class="hint">${tr(`Sichert alles: Posten, Haushalte, Kontostände und die Umsätze der Statistik, für alle Nutzer. Automatisch vor jedem CSV-Import, vor jedem Wiederherstellen und wenn ein Update das Datenformat ändert. Die letzten 30 liegen in <code>${esc(this._backups?.folder || "/config/haushaltsbuch_backups")}</code> und sind auch in den normalen Home-Assistant-Backups enthalten.`, `Backs up everything: entries, households, balances and the statistics transactions, for all users. Automatically before every CSV import, every restore and whenever an update changes the data layout. The last 30 are kept in <code>${esc(this._backups?.folder || "/config/haushaltsbuch_backups")}</code> and are part of normal Home Assistant backups too.`)}</p>
      ${list.length ? `<div class="backup-list">${list
        .map((b) => `<div class="backup-row">
          <div class="entry-main">
            <div class="entry-name">${when(b.created)}</div>
            <div class="entry-meta">${esc(reasons[b.reason] || b.reason)} · ${tr(`${b.items} Posten`, `${b.items} entries`)}${b.households ? ` · ${tr(`${b.households} Haushalte`, `${b.households} households`)}` : ""}${b.rows ? ` · ${tr(`${b.rows} Umsätze`, `${b.rows} transactions`)}` : ""} · ${Math.max(1, Math.round(b.size / 1024))} KB</div>
          </div>
          <div class="backup-actions">
            <button class="secondary small" data-action="backup-download" data-id="${esc(b.id)}">${tr("Herunterladen", "Download")}</button>
            <button class="secondary small" data-action="backup-restore" data-id="${esc(b.id)}" data-created="${esc(when(b.created))}">${tr("Zurückspielen", "Restore")}</button>
          </div>
        </div>`)
        .join("")}</div>` : `<p class="hint">${tr("Noch keine Sicherung vorhanden.", "No backup yet.")}</p>`}
      <div class="row-actions">
        <button class="secondary small" data-action="backup-upload">${tr("Sicherungsdatei zurückspielen …", "Restore from file …")}</button>
        <input type="file" accept=".json,application/json" data-change="backup-file" hidden>
      </div>
    </div>`;
  }

  async _downloadJson(name, data) {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
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
  }

  _restoreFinished(summary) {
    setTimeout(() => {
      this._dialog = {
        type: "notice",
        title: tr("Zurückgespielt", "Restored"),
        text: tr(`Der Stand vom ${new Date(summary.created).toLocaleString(DATE_LOCALE)} ist wieder da (${summary.items} Posten). Der Stand davor wurde vorher gesichert.`, `The state of ${new Date(summary.created).toLocaleString(DATE_LOCALE)} is back (${summary.items} entries). The state before was backed up first.`),
      };
      this._render();
    });
  }

  _renderBalanceForm() {
    const b = this._scopeBalance();
    return `<form data-form="balance">
      <h2>${this._isHousehold() ? tr("Haushaltskonto setzen", "Set household balance") : tr("Kontostand setzen", "Set balance")}</h2>
      <p class="hint">${tr("Trage den Stand aus deiner Banking-App ein. Alle Buchungen bis einschließlich zu diesem Datum gelten als enthalten.", "Enter the balance from your banking app. All bookings up to and including this date count as included.")}</p>
      <div class="grid">
        <label>${tr("Kontostand", "Balance")} (${esc(this._state.currency)})<input name="balance" ${this._amountAttrs(true)} required value="${this._amountValue(b.balance)}"></label>
        <label>${tr("Stand vom", "As of")}<input name="balance_date" type="date" required value="${iso(today())}"></label>
      </div>
      <div class="dialog-actions"><span></span><div>
        <button type="button" class="secondary" data-action="close">${tr("Abbrechen", "Cancel")}</button>
        <button type="submit">${tr("Speichern", "Save")}</button>
      </div></div>
    </form>`;
  }

  _renderHouseholdForm(d) {
    const h = d.household || { name: "", members: [this._state.user.id] };
    return `<form data-form="household">
      <h2>${h.id ? tr("Haushalt bearbeiten", "Edit household") : tr("Haushalt anlegen", "Add household")}</h2>
      <div class="grid">
        <label class="full">${tr("Name", "Name")}<input name="name" required maxlength="60" value="${esc(h.name)}" placeholder="${tr("z.B. Familie", "e.g. Family")}"></label>
      </div>
      <div class="members">
        <div class="label">${tr("Mitglieder", "Members")}</div>
        ${this._state.users
          .map(
            (u) => `<label class="check"><input type="checkbox" name="members" value="${esc(u.id)}" ${h.members.includes(u.id) ? "checked" : ""} ${u.id === this._state.user.id ? "disabled checked" : ""}> ${esc(u.name)}</label>`
          )
          .join("")}
      </div>
      <div class="dialog-actions">
        ${h.id ? `<button type="button" class="danger" data-action="delete-household">${tr("Löschen", "Delete")}</button>` : "<span></span>"}
        <div>
          <button type="button" class="secondary" data-action="close">${tr("Abbrechen", "Cancel")}</button>
          <button type="submit">${tr("Speichern", "Save")}</button>
        </div>
      </div>
    </form>`;
  }
}
