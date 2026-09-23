import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  euro, csvZahl, parseEuro, standardConfig, neueBestellung, bestellSumme, buchungAus,
  rueckgeld, schnellBetraege, neuerAbend, abendBuchen, abendStornieren, abrechnungAusAbend,
  zusammenfuehren, preislisteZuCode, abrechnungZuCode, leseCode, csv, einnahmen, kodiere,
} from '../kern.js';

const NBSP = ' ';

function config() {
  return {
    pfandCent: 100,
    pfandStandardAn: true,
    pinHash: null,
    stand: '2026-09-21T18:30:00.000Z',
    getraenke: [
      { id: 'bier', name: 'Bier', preisCent: 250, pfand: true },
      { id: 'cola', name: 'Cola', preisCent: 200, pfand: true },
      { id: 'kaffee', name: 'Kaffee', preisCent: 150, pfand: false },
    ],
  };
}

test('euro formatiert deutsch', () => {
  assert.equal(euro(250), `2,50${NBSP}€`);
  assert.equal(euro(5), `0,05${NBSP}€`);
  assert.equal(euro(123456), `1.234,56${NBSP}€`);
  assert.equal(euro(-200), `−2,00${NBSP}€`);
  assert.equal(csvZahl(-205), '-2,05');
});

test('parseEuro', () => {
  assert.equal(parseEuro('2,50'), 250);
  assert.equal(parseEuro('2.5'), 250);
  assert.equal(parseEuro(' 12 € '), 1200);
  assert.equal(parseEuro('0,1'), 10);
  assert.equal(parseEuro('1,005'), null);
  assert.equal(parseEuro('abc'), null);
  assert.equal(parseEuro(''), null);
  assert.equal(parseEuro('-1'), null);
});

test('Summe mit Pfand: nur Getränke mit Pfand zählen', () => {
  const c = config();
  const b = { posten: { bier: 2, kaffee: 1 }, mitPfand: true, zurueck: 0 };
  const s = bestellSumme(b, c);
  assert.equal(s.getraenkeCent, 650);
  assert.equal(s.pfandAnzahl, 2);
  assert.equal(s.pfandCent, 200);
  assert.equal(s.summeCent, 850);
  assert.deepEqual(s.zeilen.map((z) => z.name), ['Bier', 'Kaffee']);
});

test('Summe ohne Pfand', () => {
  const s = bestellSumme({ posten: { bier: 2, kaffee: 1 }, mitPfand: false, zurueck: 0 }, config());
  assert.equal(s.pfandCent, 0);
  assert.equal(s.summeCent, 650);
});

test('Pfandrückgabe zieht ab, nur Rückgabe ergibt negative Summe', () => {
  const c = config();
  assert.equal(bestellSumme({ posten: { cola: 1 }, mitPfand: true, zurueck: 2 }, c).summeCent, 100);
  const nurRueck = bestellSumme({ posten: {}, mitPfand: true, zurueck: 2 }, c);
  assert.equal(nurRueck.summeCent, -200);
  assert.equal(nurRueck.leer, false);
  assert.equal(bestellSumme(neueBestellung(c), c).leer, true);
});

test('gelöschte Getränke fallen aus der Bestellung', () => {
  const s = bestellSumme({ posten: { weg: 3, bier: 1 }, mitPfand: true, zurueck: 0 }, config());
  assert.equal(s.summeCent, 350);
});

test('neue Bestellung übernimmt Pfand-Standard', () => {
  const c = config();
  assert.equal(neueBestellung(c).mitPfand, true);
  c.pfandStandardAn = false;
  assert.equal(neueBestellung(c).mitPfand, false);
});

test('Wechselgeld und Schnellbeträge', () => {
  assert.equal(rueckgeld(850, 2000), 1150);
  assert.equal(rueckgeld(850, 500), -350);
  assert.deepEqual(schnellBetraege(850), [900, 1000, 2000, 5000]);
  assert.deepEqual(schnellBetraege(1000), [2000, 5000, 10000]);
  assert.deepEqual(schnellBetraege(250), [300, 500, 1000, 2000]);
  assert.deepEqual(schnellBetraege(0), []);
  assert.deepEqual(schnellBetraege(-200), []);
});

test('Buchen und Stornieren', () => {
  const c = config();
  let abend = neuerAbend();
  const b1 = buchungAus(bestellSumme({ posten: { bier: 2, kaffee: 1 }, mitPfand: true, zurueck: 0 }, c));
  abend = abendBuchen(abend, b1, '2026-09-21T18:05:00.000Z');
  const b2 = buchungAus(bestellSumme({ posten: { bier: 1 }, mitPfand: false, zurueck: 1 }, c));
  abend = abendBuchen(abend, b2, '2026-09-21T19:10:00.000Z');

  assert.deepEqual(abend.verkauft, { Bier: { anzahl: 3, cent: 750 }, Kaffee: { anzahl: 1, cent: 150 } });
  assert.equal(abend.getraenkeCent, 900);
  assert.equal(abend.pfandAus, 2);
  assert.equal(abend.pfandZurueck, 1);
  assert.equal(abend.bestellungen, 2);
  assert.equal(abend.start, '2026-09-21T18:05:00.000Z');
  assert.equal(abend.ende, '2026-09-21T19:10:00.000Z');
  assert.equal(einnahmen(abend), 900 + 200 - 100);

  abend = abendStornieren(abend);
  assert.deepEqual(abend.verkauft, { Bier: { anzahl: 2, cent: 500 }, Kaffee: { anzahl: 1, cent: 150 } });
  assert.equal(abend.bestellungen, 1);
  assert.equal(abend.pfandZurueck, 0);
  assert.equal(abend.letzte, null);
  assert.equal(abend.ende, '2026-09-21T18:05:00.000Z', 'Ende springt auf die vorige Buchung zurück');
  assert.equal(abendStornieren(abend), abend, 'zweites Storno ändert nichts');

  const leer = abendStornieren(abendBuchen(neuerAbend(), b2));
  assert.equal(leer.start, null);
  assert.deepEqual(leer.verkauft, {});
});

test('Preisänderung am Abend: Umsatz bleibt beim Buchungspreis', () => {
  const c = config();
  let abend = abendBuchen(neuerAbend(), buchungAus(bestellSumme({ posten: { bier: 1 }, mitPfand: true, zurueck: 0 }, c)));
  c.getraenke[0].preisCent = 300;
  c.pfandCent = 200;
  abend = abendBuchen(abend, buchungAus(bestellSumme({ posten: { bier: 1 }, mitPfand: true, zurueck: 0 }, c)));
  assert.deepEqual(abend.verkauft.Bier, { anzahl: 2, cent: 550 });
  assert.equal(abend.pfandAusCent, 300);
});

test('Zusammenführen über mehrere Handys', () => {
  const c = config();
  const a1 = abendBuchen(neuerAbend(), buchungAus(bestellSumme({ posten: { bier: 2 }, mitPfand: true, zurueck: 0 }, c)), '2026-09-21T18:00:00.000Z');
  const a2 = abendBuchen(neuerAbend(), buchungAus(bestellSumme({ posten: { bier: 1, cola: 1 }, mitPfand: true, zurueck: 1 }, c)), '2026-09-21T17:30:00.000Z');
  const z = zusammenfuehren([abrechnungAusAbend(a1, 'Anna'), abrechnungAusAbend(a2, 'Ben')], ['Cola', 'Bier']);
  assert.deepEqual(z.verkauft, [
    { name: 'Cola', anzahl: 1, cent: 200 },
    { name: 'Bier', anzahl: 3, cent: 750 },
  ]);
  assert.equal(z.getraenkeAnzahl, 4);
  assert.equal(z.pfandAus, 4);
  assert.equal(z.pfandZurueck, 1);
  assert.equal(z.bestellungen, 2);
  assert.equal(z.einnahmenCent, 950 + 400 - 100);
  assert.equal(z.start, '2026-09-21T17:30:00.000Z');
  assert.equal(z.ende, '2026-09-21T18:00:00.000Z');
});

test('Preisliste: Link hin und zurück', () => {
  const c = config();
  c.getraenke.push({ id: 'x', name: 'Schorle „süß“ 0,3 l', preisCent: 220, pfand: true });
  c.pinHash = 'a'.repeat(64);
  c.pfandStandardAn = false;
  c.zaehlen = true;
  const link = 'https://example.org/kasse/#preise=' + preislisteZuCode(c);
  const { typ, daten } = leseCode(link);
  assert.equal(typ, 'preise');
  assert.equal(daten.pfandCent, 100);
  assert.equal(daten.pfandStandardAn, false);
  assert.equal(daten.zaehlen, true);
  assert.equal(daten.pinHash, 'a'.repeat(64));
  assert.equal(daten.stand, c.stand);
  assert.deepEqual(daten.getraenke.map(({ name, preisCent, pfand }) => [name, preisCent, pfand]),
    c.getraenke.map(({ name, preisCent, pfand }) => [name, preisCent, pfand]));
  assert.ok(daten.getraenke.every((g) => g.id), 'neue IDs vergeben');
});

test('Abrechnung: Link hin und zurück, auch als reiner Code', () => {
  const c = config();
  const abend = abendBuchen(neuerAbend(), buchungAus(bestellSumme({ posten: { bier: 2, kaffee: 1 }, mitPfand: true, zurueck: 1 }, c)));
  const a = abrechnungAusAbend(abend, 'Jörg');
  const code = abrechnungZuCode(a);
  assert.deepEqual(leseCode(`Hier meine Zählliste: https://x.y/#zaehlliste=${code} danke`).daten, a);
  assert.deepEqual(leseCode(`alter Link: https://x.y/#abrechnung=${code}`).daten, a, 'Links älterer Versionen gehen weiter');
  assert.deepEqual(leseCode(code).daten, a);
});

test('ungültige Codes werden abgelehnt', () => {
  assert.throws(() => leseCode(''), /gültig/);
  assert.throws(() => leseCode('https://x.y/#preise=kaputt!!'), /gültig/);
  assert.throws(() => leseCode('eyJ2IjoxfQ'), /gültig/); // {"v":1}
  const c = config();
  c.getraenke[0].preisCent = -5;
  assert.throws(() => leseCode(preislisteZuCode(c)), /Ungültige Preisliste/);
});

test('CSV', () => {
  const c = config();
  const abend = abendBuchen(neuerAbend(), buchungAus(bestellSumme({ posten: { bier: 2 }, mitPfand: true, zurueck: 1 }, c)), '2026-09-21T18:00:00.000Z');
  const a = abrechnungAusAbend(abend, 'Anna; Ben');
  const text = csv(zusammenfuehren([a]), { titel: 'Gesamt', quellen: [a] });
  const zeilen = text.trim().split('\r\n');
  assert.equal(zeilen[0], 'York:Wandelbar;Gesamt');
  assert.ok(zeilen.includes('Bier;2;5,00'));
  assert.ok(zeilen.includes('Pfand zurück;1;-1,00'));
  assert.ok(zeilen.includes('Rechnerischer Wert;;6,00'));
  assert.ok(zeilen.includes('"Anna; Ben";2026-09-21T18:00:00.000Z;2026-09-21T18:00:00.000Z;1;6,00'));
});

test('Standard-Config ist gültig und teilbar', () => {
  const c = standardConfig();
  assert.deepEqual(c.getraenke.map((g) => `${g.name} ${euro(g.preisCent)}`), [
    'Wasser', 'Apfelschorle', 'Cola', 'Bier', 'Radler', 'Alkoholfreies', 'Wein', 'Weißbier', 'Aperol',
  ].map((n, i) => `${n} ${euro([150, 200, 200, 250, 250, 250, 400, 350, 600][i])}`));
  assert.ok(c.getraenke.every((g) => g.pfand));
  assert.equal(c.pfandCent, 100);
  assert.equal(c.zaehlen, true);
  const { typ, daten } = leseCode(preislisteZuCode(c));
  assert.equal(typ, 'preise');
  assert.equal(daten.zaehlen, true);
});

test('alte Preisliste-Links ohne Zähl-Schalter bedeuten: nicht mitzählen', () => {
  const c = config();
  const code = kodiere({ v: 1, t: 'p', s: c.stand, p: 100, d: 1, h: 0, g: [['Bier', 250, 1]] });
  assert.equal(leseCode(code).daten.zaehlen, false);
});
