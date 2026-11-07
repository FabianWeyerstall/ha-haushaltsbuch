# Changelog

Was sich in jeder Version geändert hat. Die neueste Version steht oben.

Ob nach einem Update ein Neustart von Home Assistant nötig ist, steht in den
Release-Notes auf GitHub und in HACS. Der Hinweis wird beim Veröffentlichen
automatisch aus den geänderten Dateien ermittelt (siehe `scripts/release_notes.py`).

## 0.10.0rc11 – 2026-11-07

### Behoben
- Posten: Die vier Zahlen oben stehen auf dem iPhone sauber in zwei Spalten untereinander.

## 0.10.0rc10 – 2026-11-07

### Neu
- Monatsübersicht: Budgets zeigen im laufenden und in vergangenen Monaten „ausgegeben von Budget“ (z.B. „273,04 € von 428,57 €“), wie die Budget-Karte. Sammeltöpfe zeigen „X € ausgegeben“.

### Geändert
- Installation: Ab Home Assistant 2026.11 über Einstellungen → Marketplace.
- Anleitung mit Bildern zu CSV-Import und Statistik.

## 0.10.0rc9 – 2026-11-07

### Neu
- Posten: Neben „Ausgaben pro Monat“ steht jetzt „Ohne Budgets“. Das sind die festen Kosten. Unter „Ausgaben pro Monat“ steht, wie viel davon auf Budgets entfällt, also auf das, wo man sparen kann.

## 0.10.0rc8 – 2026-11-07

### Neu
- Posten duplizieren: Im geöffneten Posten gibt es unten den Button „Duplizieren“. Er übernimmt alle Einstellungen, Buchungen werden nicht mitkopiert.
- Vorlage „Haus“ (einmalig, Kategorie Haus) für Anschaffungen und Arbeiten am Haus.

### Geändert
- Die gespeicherten Daten tragen jetzt eine Versionsnummer. Bei einer Formatänderung wird vorher automatisch gesichert. Daten einer neueren Version werden nicht überschrieben.
- Das Panel ist in mehrere Dateien aufgeteilt und wird ohne Browser-Cache ausgeliefert, damit nach einem Update nie alte und neue Teile gemischt werden.
- Automatische Tests für den Outbank-Import und ein Browser-Test mit echtem Home Assistant.

## 0.10.0rc1 – rc7 – 2026-11-06 bis 2026-11-07

### Neu
- CSV-Import der Kontoumsätze: Outbank-Export, andere Banken mit Dialog „Welche Spalte ist was?“ und CAMT.053 (auch als ZIP).
- Abgleich der Umsätze mit den Posten, Preisänderungen, seltene und gleitende Posten, Jahresabrechnungen, Vorschläge für neue Posten.
- Alte Anbieter und Verträge laufen unter dem heutigen Posten zusammen.
- Tab „Statistik“ mit Monat, Jahr und Kategorien, dazu Auswertungen wie vergessene Abos, Budgets aus echten Zahlen und Preisentwicklung.
- Sicherungen im Haushalt-Tab (nur für Admins), automatisch vor jedem CSV-Import.

### Behoben
- Absicherung gegen fehlerhafte oder bösartige Dateien: Größenlimit, ZIP-Bomben, Binärdateien.

## Ältere Versionen

Bis 0.9.2 stehen die Änderungen in den [GitHub-Releases](https://github.com/FabianWeyerstall/ha-haushaltsbuch/releases).
