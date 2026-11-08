# Gespeicherte Daten in alten Formaten

Diese Dateien sehen genau so aus wie `/config/.storage/haushaltsbuch.*` bei
früheren Versionen. `tests/test_migrations.py` prüft, dass jede davon mit der
aktuellen Version ohne Verlust geladen wird.

| Datei | Stand |
| --- | --- |
| `haushaltsbuch.data-1.1-erste-version.json` | so knapp wie bei den ersten Versionen: ohne Haushalte, Nutzer ohne Kontostand-Datum, kein `minor_version` |
| `haushaltsbuch.data-1.1-rc4.json` | mit 0.10.0rc4 erzeugt: Haushalt, Gehaltsmonat, Budget mit Ausgabe, gleitender Posten, feste Termine, Vertrag, Bank-Schlüssel, Statistik-Einstellungen |
| `haushaltsbuch.ledger-1.1-rc4.json` | gespeicherte Umsätze aus 0.10.0rc4 |

Alle Daten sind erfunden. **Diese Dateien nie ändern.** Wenn sich das Format
ändert, kommt eine neue Datei mit der neuen Version dazu; die alten bleiben,
damit auch ein Update über mehrere Versionen hinweg geprüft wird.
