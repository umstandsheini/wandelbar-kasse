# York:Wandelbar Rechenhilfe

Rechenhilfe für die Theke der [York:Wandelbar](https://www.stadt-muenster.de/zusammenhalt-in-vielfalt/yorkwandelbar) in Münster-Gremmendorf. Sie rechnet Getränkepreise, Pfand und Rückgeld zusammen und führt auf Wunsch eine Strichliste der ausgegebenen Getränke. Sie läuft im Browser auf dem eigenen Handy, braucht keine Installation und keinen Server und funktioniert nach dem ersten Öffnen auch offline.

**Adresse:** https://umstandsheini.github.io/wandelbar-kasse/

**Was sie nicht ist:** kein Kassensystem. Sie erfasst keine einzelnen Zahlungsvorgänge, kennt keine Kassenbestände und druckt keine Belege. Was tatsächlich eingenommen wurde, zählt ihr am Ende des Abends in der Geldkassette und haltet es im Kassenbericht fest (siehe [Rechtlicher Hintergrund](#rechtlicher-hintergrund)).

## An der Theke („Rechner“)

1. Getränke antippen. Jedes Antippen zählt eins dazu, mit **−** in der Liste nimmst du eins weg.
2. Oben steht der Schalter **Mit Pfand / Ohne Pfand**. „Ohne Pfand“ gilt nur für die aktuelle Ausgabe, danach springt der Schalter zurück.
3. Bringt jemand ein Glas zurück, tippst du **Pfand zurück** (einmal pro Glas). Der Betrag wird abgezogen. Gibt jemand nur Gläser zurück, zeigt die Seite „Erstattung“.
4. **Abschließen** antippen, den Betrag wählen, den der Gast gibt (oder eintippen), das Rückgeld ablesen und mit **Fertig** bestätigen.

Zu früh auf „Fertig“ getippt? Kurz darauf erscheint „Rückgängig“. Bei eingeschalteter Zählung geht es auch später noch über **Zählung → Letzte Ausgabe zurücknehmen**.

## Getränkeausgaben zählen

Unter **Preise** (mit PIN) gibt es den Schalter **Getränkeausgaben zählen**. Er ist **standardmäßig an**.

- **An:** Beim Abschließen wird mitgezählt, wie viele Getränke welcher Sorte ausgegeben wurden, dazu Pfand raus und Pfand zurück. Gespeichert werden nur Mengen und der daraus gerechnete Warenwert, keine einzelnen Zahlungen, kein Bargeldbestand. Die Bereiche „Zählung“ und „Gesamt“ sind sichtbar.
- **Aus:** Die Seite rechnet nur und speichert gar nichts. „Zählung“ und „Gesamt“ sind ausgeblendet.

Der Schalter wird mit der Preisliste an die anderen Handys weitergegeben. Beim Ausschalten löscht die Seite vorhandene Zähldaten, nachdem sie gewarnt hat.

## Am Ende des Abends

- Jede Person trägt unter **Zählung** ihren Namen ein und tippt **Zählliste weitergeben**. Den Link schickst du per WhatsApp o. Ä., oder er wird als QR-Code gescannt.
- Wer alles zusammenzählt, öffnet die Links. Die Listen landen unter **Gesamt** und werden dort addiert (auf Wunsch mit der eigenen Zählung). Von dort gibt es auch einen CSV-Export für Excel.
- **Die Einnahmen ergeben sich aus dem Kassenbericht**, nicht aus dieser Seite: Kasse zählen, Wechselgeld vom Anfang abziehen, bar bezahlte Ausgaben (mit Beleg) wieder dazurechnen, unterschreiben und aufbewahren. Die Strichliste taugt als Gegenprobe.
- CSV herunterladen und zum Kassenbericht legen, **bevor** ihr auf jedem Handy **Neue Zählung starten** tippt.

## Preise ändern

- Unter **Preise** mit der PIN entsperren (Standard: `1234`, bitte gleich ändern). Dort kannst du Getränke hinzufügen, umbenennen, sortieren und löschen, Preise und Pfandbetrag ändern und das Zählen ein- oder ausschalten. Danach **Speichern**.
- Mit **QR-Code / Link anzeigen** gibst du die neue Preisliste an die anderen weiter: Sie öffnen den Link oder scannen den Code und tippen auf „Übernehmen“. Die PIN wird dabei mitgegeben.
- Die PIN schützt nur vor versehentlichen Änderungen. Die Seite ist öffentlich, ein echter Zugangsschutz ist sie also nicht.

## Gut zu wissen

- **Display bleibt an:** Solange die Seite offen und im Vordergrund ist, sperrt sich das Handy nicht. Das lässt sich pro Handy unter **Preise → Bildschirm anlassen** abschalten, eine PIN braucht es dafür nicht. Das funktioniert in aktuellen Browsern (Chrome/Android, Safari ab iOS 16.4), im Energiesparmodus aber eventuell nicht. Kostet etwas Akku, eine Powerbank an der Theke hilft.
- Alle Daten liegen nur im Browser des jeweiligen Handys. Leert man dort die Browserdaten, sind Zählung und Preise weg. Die Preisliste kommt dann einfach wieder über den Link.
- **iPhone mit Symbol auf dem Home-Bildschirm:** Diese App-Ansicht hat einen eigenen Speicher, getrennt von Safari. Ein angetippter Link öffnet sich in Safari statt in der App. Deshalb kopierst du den Link und fügst ihn in der App ein (unter **Preise** bzw. **Gesamt**). Einfacher ist es, die Seite als normales Lesezeichen in Safari zu nutzen.

## Rechtlicher Hintergrund

Kurzfassung des Rechercheergebnisses, keine Rechts- oder Steuerberatung:

- **§ 146a AO** verpflichtet nur, wer aufzeichnungspflichtige Geschäftsvorfälle „mit Hilfe eines elektronischen Aufzeichnungssystems erfasst“. Ein elektronisches Aufzeichnungssystem ist laut AEAO zu § 146, Nr. 2.1.4 Hard- und Software, die elektronische Aufzeichnungen zur Dokumentation von Geschäftsvorfällen und damit Grundaufzeichnungen erstellt.
- **§ 1 KassenSichV** erfasst „elektronische oder computergestützte Kassensysteme oder Registrierkassen“ (dazu EU-Taxameter und Wegstreckenzähler). Ausgenommen sind unter anderem Fahrschein-, Park- und Warenautomaten, Geldautomaten und elektronische Buchhaltungsprogramme.
- **Kassenfunktion** haben laut AEAO zu § 146a, Nr. 1.2 Systeme, die „der Erfassung und Abwicklung von zumindest teilweise baren Zahlungsvorgängen dienen können“. Eine Kassenlade ist ausdrücklich nicht erforderlich, Tablet- und App-Lösungen sind mitgemeint.
- Deshalb ist diese Seite als **Rechenhilfe** gebaut: Sie erfasst keine Zahlungsvorgänge, sondern rechnet Preise zusammen und zählt auf Wunsch aus, wie viele Getränke ausgegeben wurden.
- Eine Registrierkassenpflicht gibt es derzeit nicht, eine **offene Ladenkasse** mit täglichem Kassenbericht ist zulässig. Ein Referentenentwurf vom 7.8.2026 sieht eine Pflicht ab 2028 für Betriebe über 100.000 € Gesamtumsatz vor; beschlossen ist sie nicht.
- **Wichtig:** Ob eine konkrete Software im Einzelfall als Aufzeichnungssystem gilt, entscheiden Finanzamt und Steuerberatung, nicht die Wortwahl in der Oberfläche. Wenn ihr die Strichliste als Grundlage für die Buchhaltung nutzt, hebt die CSV-Exporte zusammen mit den Kassenberichten auf.

Quellen: [§ 146a AO](https://www.gesetze-im-internet.de/ao_1977/__146a.html) · [§ 146 AO](https://www.gesetze-im-internet.de/ao_1977/__146.html) · [§ 1 KassenSichV](https://www.gesetze-im-internet.de/kassensichv/__1.html) · [AEAO zu § 146a (BMF-Schreiben vom 30.6.2023)](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/AO-Anwendungserlass/2023-06-30-AEAO-Par-146-AO.pdf?__blob=publicationFile&v=1)

## Für Entwickler

Statische Seite ohne Build-Schritt: `index.html`, `style.css`, `app.js` (Oberfläche), `kern.js` (Rechenlogik, ohne DOM), `sw.js` (Offline-Cache), `vendor/qrcode.js` ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT). Beträge werden in Cent als Ganzzahl gerechnet. Intern heißen einige Bezeichner noch `kasse`, `abend` und `abrechnung`; in der Oberfläche steht dafür Rechner, Zählung und Zählliste.

```bash
npm test                      # Unit-Tests für kern.js (Node 18+)
python -m http.server 8000    # lokal starten → http://localhost:8000
```

**Neue Version veröffentlichen:** `APP_VERSION` in `version.js` hochzählen, sonst behalten die Handys die alte Version im Offline-Cache. Nach dem Hochladen zeigt die Seite „Neue Version verfügbar“.
