# York:Wandelbar Kasse

Kleine Theken-Kasse für die [York:Wandelbar](https://www.stadt-muenster.de/zusammenhalt-in-vielfalt/yorkwandelbar) in Münster-Gremmendorf. Sie läuft im Browser auf dem eigenen Handy, braucht keine Installation und keinen Server und funktioniert nach dem ersten Öffnen auch offline.

**Adresse:** https://umstandsheini.github.io/wandelbar-kasse/

## An der Theke

1. Getränke antippen. Jedes Antippen zählt eins dazu, mit **−** in der Liste nimmst du eins weg.
2. Oben steht der Schalter **Mit Pfand / Ohne Pfand**. „Ohne Pfand“ gilt nur für die aktuelle Bestellung, danach springt der Schalter zurück.
3. Bringt jemand ein Glas zurück, tippst du **Pfand zurück** (einmal pro Glas). Der Betrag wird abgezogen. Gibt jemand nur Gläser zurück, zeigt die Kasse „Auszahlen“.
4. **Kassieren** antippen, den Betrag wählen, den der Gast gibt (oder eintippen), das Rückgeld ablesen und mit **Fertig** buchen.

Aus Versehen gebucht? Unter **Abend → Letzte Bestellung stornieren**.

## Am Ende des Abends

- Jede Person trägt unter **Abend** ihren Namen ein und tippt **Abrechnung an Kassenwart senden**. Den Link schickst du per WhatsApp o. Ä., oder der Kassenwart scannt den QR-Code mit der Kamera.
- Der **Kassenwart** öffnet die Links. Die Abrechnungen landen unter **Gesamt** und werden dort zusammengezählt (auf Wunsch mit der eigenen Zählung). Von dort gibt es auch einen CSV-Export für Excel.
- Danach auf jedem Handy **Neuen Abend starten**.

## Preise ändern

- Unter **Preise** mit der PIN entsperren (Standard: `1234`, bitte gleich ändern). Dort kannst du Getränke hinzufügen, umbenennen, sortieren und löschen und Preise sowie den Pfandbetrag ändern. Danach **Speichern**.
- Mit **QR-Code / Link anzeigen** gibst du die neue Preisliste an die anderen weiter: Sie öffnen den Link oder scannen den Code und tippen auf „Übernehmen“. Die PIN wird dabei mitgegeben.
- Die PIN schützt nur vor versehentlichen Änderungen. Die Seite ist öffentlich, ein echter Zugangsschutz ist sie also nicht.

## Gut zu wissen

- Alle Daten liegen nur im Browser des jeweiligen Handys. Leert man dort die Browserdaten, sind Zählung und Preise weg. Die Preisliste kommt dann einfach wieder über den Link.
- **iPhone mit Symbol auf dem Home-Bildschirm:** Diese App-Ansicht hat einen eigenen Speicher, getrennt von Safari. Ein angetippter Link öffnet sich in Safari statt in der App. Deshalb kopierst du den Link und fügst ihn in der App ein (unter **Preise** bzw. **Gesamt**). Einfacher ist es, die Kasse als normales Lesezeichen in Safari zu nutzen.
- Die Tagesübersicht speichert Verkaufszahlen. Ob der Verein damit Vorgaben für elektronische Kassen (KassenSichV/TSE) beachten muss, klärt bitte der Vorstand bzw. die Steuerberatung.

## Für Entwickler

Statische Seite ohne Build-Schritt: `index.html`, `style.css`, `app.js` (Oberfläche), `kern.js` (Rechenlogik, ohne DOM), `sw.js` (Offline-Cache), `vendor/qrcode.js` ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT). Beträge werden in Cent als Ganzzahl gerechnet.

```bash
npm test                      # Unit-Tests für kern.js (Node 18+)
python -m http.server 8000    # lokal starten → http://localhost:8000
```

**Neue Version veröffentlichen:** `APP_VERSION` in `version.js` hochzählen, sonst behalten die Handys die alte Version im Offline-Cache. Nach dem Hochladen zeigt die App „Neue Version verfügbar“.
