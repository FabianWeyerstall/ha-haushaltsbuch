"""Writes the made-up Outbank files outbank-drei-konten-*.csv.

All names, IBANs and amounts are invented. Run from this folder:
    python3 make-fixtures.py
then update the expected results (see ../README.md).
"""

H = "#;Konto;Datum;Valuta;Betrag;Währung;Name;Nummer;Bank;Zweck;Hauptkategorie;Kategorie;Kategoriepfad;Tags;Notiz;Abweichender Zahlungsempfänger;Buchungsschlüssel;Buchungstext;Art der Zahlung;SEPA Referenz;Kundenreferenz;Mandatsreferenz;Gläubiger ID"
G = "DE00111111110000000001"  # Girokonto
T = "DE00222222220000000002"  # Tagesgeld
K = "DE00333333330000000003"  # Kreditkartenkonto
X = "DE00999999990000000000"
ROWS = [
    # nr, konto, datum, betrag, name, nummer, zweck, haupt, kategorie, pfad, buchungstext, mandat, gläubiger
    (1, G, "30.10.2026", "2.700,00", "Muster Arbeitgeber GmbH", X, "Gehalt Oktober", "Einkommen", "Gehalt", "Einkommen/Gehalt", "LOHN GEHALT", "", ""),
    (2, G, "02.10.2026", "-850,00", "Hausverwaltung Sonnenhof", X, "Miete Wohnung 3 OG", "Wohnen", "Miete", "Wohnen/Miete", "DAUERAUFTRAG", "", ""),
    (3, G, "05.10.2026", "-300,00", "Eigenes Tagesgeld", T, "Umbuchung Tagesgeld", "Finanzen & Versicherungen", "Sparen", "Finanzen/Sparen", "UEBERWEISUNG", "", ""),
    (4, T, "05.10.2026", "300,00", "Max Mustermann", G, "Umbuchung Tagesgeld", "Finanzen & Versicherungen", "Sparen", "Finanzen/Sparen", "GUTSCHRIFT", "", ""),
    (5, G, "12.10.2026", "-150,00", "Max Mustermann", "", "Rücklage", "Sonstiges", "Umbuchung", "Sonstiges/Umbuchung", "UEBERWEISUNG", "", ""),
    (6, T, "14.10.2026", "150,00", "Max Mustermann", "", "Rücklage", "Sonstiges", "Umbuchung", "Sonstiges/Umbuchung", "GUTSCHRIFT", "", ""),
    (7, G, "15.10.2026", "-512,34", "Kreditkarten-Abrechnung", "", "Kreditkartenabrechnung 10/2026", "Sonstiges", "Bankgebühren", "Sonstiges/Bankgebühren", "LASTSCHRIFT", "KK-77", "DE55ZZZ00000000005"),
    (8, K, "21.10.2026", "512,34", "Ausgleich", "", "Kartenabrechnung Ausgleich", "Sonstiges", "Umbuchung", "Sonstiges/Umbuchung", "GUTSCHRIFT", "", ""),
    (9, K, "08.10.2026", "-89,90", "Elektromarkt Nord", "", "Kauf; Filiale 12\nKabel und Lampe", "Haushalt", "Elektronik", "Haushalt/Elektronik", "KARTENZAHLUNG", "", ""),
    (10, G, "04.10.2026", "-74,00", "Stadtwerke Musterstadt", X, 'Abschlag Strom "Grundversorgung"', "Lebenshaltung", "Strom", "Lebenshaltung/Strom", "FOLGELASTSCHRIFT", "SW-998877", "DE33ZZZ00000000003"),
    (11, G, "04.10.2026", "0,00", "Nullbuchung", X, "Kontoabschluss", "Sonstiges", "Bankgebühren", "Sonstiges/Bankgebühren", "ABSCHLUSS", "", ""),
    (12, G, "", "-5,00", "Ohne Datum", X, "kaputte Zeile", "Sonstiges", "", "", "", "", ""),
    (13, G, "20.10.2026", "-18,36", "ARD ZDF Deutschlandradio Beitragsservice", X, "Rundfunkbeitrag", "Lebenshaltung", "Rundfunk", "Lebenshaltung/Rundfunk", "FOLGELASTSCHRIFT", "RB-1", "DE66ZZZ00000000006"),
    (14, G, "28.10.2026", "1.234,56", "Einspeisung Solar eG", X, "Einspeisevergütung PV", "Einkommen", "Photovoltaik", "Einkommen/Photovoltaik", "GUTSCHRIFT", "", ""),
    (15, G, "31.10.2026", "-1.050,00", "Autohaus Beispiel", X, "Finanzierung Rate 14/48", "Mobilität", "Kredit", "Mobilität/Kredit", "LASTSCHRIFT", "AF-1", "DE77ZZZ00000000007"),
    # Bank fees often come without a name: the purpose stands in for it.
    (16, G, "29.10.2026", "-4,95", "", "", "Kontoführungsentgelt Oktober 2026 laut Preisaushang der Filiale", "Sonstiges", "Bankgebühren", "Sonstiges/Bankgebühren", "ENTGELT", "", ""),
    (17, K, "18.10.2026", "-1.299,00", "Möbelhaus Süd", "", "Sofa", "Haushalt", "Möbel", "Haushalt/Möbel", "KARTENZAHLUNG", "", ""),
]


def quote(value: str) -> str:
    return '"' + value.replace('"', '""') + '"' if any(c in value for c in ';"\n') else value


def main() -> None:
    lines = ["Umsätze Export", H]
    for nr, konto, datum, betrag, name, nummer, zweck, haupt, kat, pfad, text, mandat, glaeubiger in ROWS:
        cells = [str(nr), konto, datum, datum, betrag, "EUR", name, nummer, "MUSTDEFFXXX" if nummer else "", zweck,
                 haupt, kat, pfad, "", "", "", "105", text, "", "", "", mandat, glaeubiger]
        lines.append(";".join(quote(c) for c in cells))
    text = "\r\n".join(lines) + "\r\n"
    with open("outbank-drei-konten-utf8-bom.csv", "wb") as f:
        f.write(("﻿" + text).encode("utf-8"))
    with open("outbank-drei-konten-windows1252.csv", "wb") as f:
        f.write(text.encode("cp1252"))


if __name__ == "__main__":
    main()
