# Tests für das Panel (CSV-Import)

Diese Tests sichern den **Outbank-Import** ab. Sie laufen bei jedem Pull Request
automatisch (GitHub Actions, Job `panel`) und brauchen nur Node.js 22, kein
Home Assistant und keinen Browser.

```bash
node --test tests/panel/*.test.mjs
```

## Was geprüft wird

Jede Datei in `fixtures/` wird genau so verarbeitet wie im Panel:
Bytes → Text → Leser (Outbank wird erkannt) → Umbuchungen zwischen eigenen
Konten raus → Abgleich mit Posten und Vorschläge. Das Ergebnis muss exakt der
gespeicherten Datei in `expected/` entsprechen. Ändert sich irgendetwas daran,
wie Outbank-Dateien gelesen oder zugeordnet werden, schlägt der Test fehl.

Die Panel-Dateien sind normale ES-Module. `load-panel.mjs` lädt sie in Node
genau so, wie der Browser sie lädt. `modules.test.mjs` prüft zusätzlich, dass
jede Datei findet, was sie importiert.

| Datei | Inhalt |
| --- | --- |
| `outbank-ein-konto.csv` | ein Girokonto, 316 Umsätze über 14 Monate (die Demo-Datei aus den Screenshots) |
| `outbank-drei-konten-utf8-bom.csv` | Giro, Tagesgeld, Kreditkarte: Umbuchungen, Kreditkarten-Abrechnung, Buchung ohne Namen, Feld mit `;` und Zeilenumbruch, Tausenderpunkt, Nullbetrag, Zeile ohne Datum, UTF-8 mit BOM und CRLF |
| `outbank-drei-konten-windows1252.csv` | dieselbe Datei in Windows-1252, muss gleich gelesen werden |
| `make-fixtures.py` | erzeugt die beiden Drei-Konten-Dateien |

Alle Namen, IBANs und Beträge sind erfunden. **Keine echten Kontoauszüge
einchecken**, das Repository ist öffentlich.

## Wenn sich das Ergebnis absichtlich ändert

Erst prüfen, ob die Änderung wirklich gewollt ist (der Outbank-Import soll
stabil bleiben). Dann die erwarteten Dateien neu schreiben und den Unterschied
im Pull Request ansehen:

```bash
UPDATE_EXPECTED=1 node --test tests/panel/*.test.mjs
git diff tests/panel/expected
```
