# Browser-Test mit echtem Home Assistant

`run.sh` startet ein frisches Home Assistant mit dem Haushaltsbuch, und
`smoke.mjs` klickt das Panel in Chromium durch: Einrichtung, ein paar Posten,
alle Tabs, die wichtigsten Dialoge, den Outbank-CSV-Import mit der
Beispieldatei aus `tests/panel/fixtures` und die Statistik danach. Der Test
schlägt fehl bei jedem JavaScript-Fehler, jeder nicht ladbaren Panel-Datei und
jedem Schritt, dessen erwarteter Text fehlt.

Läuft bei jedem Pull Request (GitHub Actions, Job `browser`). Lokal:

```bash
pip install -r requirements_test.txt
python tests/browser/ha_requirements.py > /tmp/ha-req.txt && pip install -r /tmp/ha-req.txt
npm install --no-save playwright && npx playwright install chromium
tests/browser/run.sh          # anderer Port: HA_PORT=8124 tests/browser/run.sh
```
