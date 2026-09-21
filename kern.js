// Reine Kassenlogik ohne DOM. Alle Beträge in Cent (Ganzzahl).

export const PIN_STANDARD = '1234';

const BEISPIEL_GETRAENKE = [
  ['Wasser', 150, true],
  ['Apfelschorle', 200, true],
  ['Cola', 200, true],
  ['Bier', 250, true],
  ['Radler', 250, true],
  ['Alkoholfreies', 250, true],
  ['Wein', 300, true],
  ['Kaffee', 150, false],
  ['Tee', 150, false],
];

export function zufallsId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function standardConfig() {
  return {
    pfandCent: 100,
    pfandStandardAn: true,
    // Verkäufe mitzählen (Abend/Gesamt). Aus = reine Rechenhilfe, siehe README (KassenSichV).
    zaehlen: false,
    pinHash: null,
    getraenke: BEISPIEL_GETRAENKE.map(([name, preisCent, pfand]) => ({ id: zufallsId(), name, preisCent, pfand })),
    stand: null,
  };
}

// ---------- Geldbeträge ----------

export function euro(cent) {
  const neg = cent < 0;
  const abs = Math.abs(Math.round(cent));
  const euros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = String(abs % 100).padStart(2, '0');
  return (neg ? '−' : '') + euros + ',' + rest + ' €';
}

export function csvZahl(cent) {
  const neg = cent < 0;
  const abs = Math.abs(Math.round(cent));
  return (neg ? '-' : '') + Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0');
}

// "2,50" / "2.5" / "2 €" → 250; ungültig → null
export function parseEuro(text) {
  if (text == null) return null;
  const s = String(text).replace(/€/g, '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

// ---------- Bestellung ----------

export function neueBestellung(config) {
  return { posten: {}, mitPfand: config.pfandStandardAn, zurueck: 0 };
}

export function bestellSumme(bestellung, config) {
  const zeilen = [];
  let getraenkeCent = 0;
  let pfandAnzahl = 0;
  for (const g of config.getraenke) {
    const anzahl = bestellung.posten[g.id] || 0;
    if (anzahl <= 0) continue;
    const cent = anzahl * g.preisCent;
    getraenkeCent += cent;
    if (g.pfand) pfandAnzahl += anzahl;
    zeilen.push({ id: g.id, name: g.name, anzahl, einzelCent: g.preisCent, cent });
  }
  if (!bestellung.mitPfand) pfandAnzahl = 0;
  const pfandCent = pfandAnzahl * config.pfandCent;
  const zurueck = bestellung.zurueck || 0;
  const zurueckCent = zurueck * config.pfandCent;
  return {
    zeilen,
    getraenkeCent,
    pfandAnzahl,
    pfandCent,
    zurueck,
    zurueckCent,
    summeCent: getraenkeCent + pfandCent - zurueckCent,
    leer: zeilen.length === 0 && zurueck === 0,
  };
}

// Was eine Bestellung zur Abendzählung beiträgt (auch für Storno)
export function buchungAus(summe) {
  return {
    posten: summe.zeilen.map((z) => [z.name, z.anzahl, z.cent]),
    pfandAus: summe.pfandAnzahl,
    pfandAusCent: summe.pfandCent,
    pfandZurueck: summe.zurueck,
    pfandZurueckCent: summe.zurueckCent,
  };
}

// ---------- Wechselgeld ----------

export function rueckgeld(summeCent, gegebenCent) {
  return gegebenCent - summeCent;
}

// Typische Beträge, die ein Gast hinlegt (ohne "Passend")
export function schnellBetraege(summeCent) {
  if (summeCent <= 0) return [];
  const kandidaten = [
    Math.ceil(summeCent / 100) * 100,
    Math.ceil(summeCent / 500) * 500,
    Math.ceil(summeCent / 1000) * 1000,
    Math.ceil(summeCent / 2000) * 2000,
    5000,
    10000,
  ];
  return [...new Set(kandidaten)].filter((c) => c > summeCent).sort((a, b) => a - b).slice(0, 4);
}

// ---------- Abend (Tageszählung) ----------

export function neuerAbend() {
  return {
    id: zufallsId(),
    start: null,
    ende: null,
    verkauft: {},
    getraenkeCent: 0,
    pfandAus: 0,
    pfandAusCent: 0,
    pfandZurueck: 0,
    pfandZurueckCent: 0,
    bestellungen: 0,
    letzte: null,
    gesendet: false,
  };
}

function wendeAn(abend, buchung, faktor) {
  const verkauft = { ...abend.verkauft };
  for (const [name, anzahl, cent] of buchung.posten) {
    const alt = verkauft[name] || { anzahl: 0, cent: 0 };
    const neu = { anzahl: alt.anzahl + faktor * anzahl, cent: alt.cent + faktor * cent };
    if (neu.anzahl <= 0) delete verkauft[name];
    else verkauft[name] = neu;
  }
  const getraenkeCent = buchung.posten.reduce((s, [, , cent]) => s + cent, 0);
  return {
    ...abend,
    verkauft,
    getraenkeCent: abend.getraenkeCent + faktor * getraenkeCent,
    pfandAus: abend.pfandAus + faktor * buchung.pfandAus,
    pfandAusCent: abend.pfandAusCent + faktor * buchung.pfandAusCent,
    pfandZurueck: abend.pfandZurueck + faktor * buchung.pfandZurueck,
    pfandZurueckCent: abend.pfandZurueckCent + faktor * buchung.pfandZurueckCent,
    bestellungen: abend.bestellungen + faktor,
    gesendet: false,
  };
}

export function abendBuchen(abend, buchung, jetzt = new Date().toISOString()) {
  return {
    ...wendeAn(abend, buchung, 1),
    start: abend.start || jetzt,
    ende: jetzt,
    letzte: { ...buchung, vorherEnde: abend.ende },
  };
}

export function abendStornieren(abend) {
  if (!abend.letzte) return abend;
  const neu = { ...wendeAn(abend, abend.letzte, -1), ende: abend.letzte.vorherEnde ?? null, letzte: null };
  if (neu.bestellungen === 0) {
    neu.start = null;
    neu.ende = null;
  }
  return neu;
}

export function einnahmen(z) {
  return z.getraenkeCent + z.pfandAusCent - z.pfandZurueckCent;
}

// ---------- Abrechnung (übertragbare Zusammenfassung) ----------

export function abrechnungAusAbend(abend, name) {
  return {
    id: abend.id,
    name: name || '',
    start: abend.start,
    ende: abend.ende,
    verkauft: Object.entries(abend.verkauft).map(([n, v]) => [n, v.anzahl, v.cent]),
    getraenkeCent: abend.getraenkeCent,
    pfandAus: abend.pfandAus,
    pfandAusCent: abend.pfandAusCent,
    pfandZurueck: abend.pfandZurueck,
    pfandZurueckCent: abend.pfandZurueckCent,
    bestellungen: abend.bestellungen,
  };
}

// Mehrere Abrechnungen zu einer zusammenfassen; Getränke werden über den Namen addiert.
// `reihenfolge` (Namen) bestimmt die Sortierung, unbekannte Namen kommen alphabetisch danach.
export function zusammenfuehren(abrechnungen, reihenfolge = []) {
  const verkauft = new Map();
  const z = {
    start: null,
    ende: null,
    getraenkeCent: 0,
    pfandAus: 0,
    pfandAusCent: 0,
    pfandZurueck: 0,
    pfandZurueckCent: 0,
    bestellungen: 0,
  };
  for (const a of abrechnungen) {
    for (const [name, anzahl, cent] of a.verkauft) {
      const alt = verkauft.get(name) || { anzahl: 0, cent: 0 };
      verkauft.set(name, { anzahl: alt.anzahl + anzahl, cent: alt.cent + cent });
    }
    for (const k of ['getraenkeCent', 'pfandAus', 'pfandAusCent', 'pfandZurueck', 'pfandZurueckCent', 'bestellungen']) {
      z[k] += a[k];
    }
    if (a.start && (!z.start || a.start < z.start)) z.start = a.start;
    if (a.ende && (!z.ende || a.ende > z.ende)) z.ende = a.ende;
  }
  const rang = (n) => {
    const i = reihenfolge.indexOf(n);
    return i === -1 ? Infinity : i;
  };
  z.verkauft = [...verkauft.entries()]
    .map(([name, v]) => ({ name, anzahl: v.anzahl, cent: v.cent }))
    .sort((a, b) => rang(a.name) - rang(b.name) || a.name.localeCompare(b.name, 'de'));
  z.getraenkeAnzahl = z.verkauft.reduce((s, v) => s + v.anzahl, 0);
  z.einnahmenCent = einnahmen(z);
  return z;
}

// ---------- Links / Codes ----------

export function kodiere(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function dekodiere(code) {
  let b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const istCent = (x, max) => Number.isInteger(x) && x >= 0 && x <= max;
const istName = (x) => typeof x === 'string' && x.trim().length > 0 && x.length <= 40;
const istDatum = (x) => x === null || (typeof x === 'string' && !Number.isNaN(Date.parse(x)));

export function preislisteZuCode(config) {
  return kodiere({
    v: 1,
    t: 'p',
    s: config.stand,
    p: config.pfandCent,
    d: config.pfandStandardAn ? 1 : 0,
    z: config.zaehlen ? 1 : 0,
    h: config.pinHash || 0,
    g: config.getraenke.map((g) => [g.name, g.preisCent, g.pfand ? 1 : 0]),
  });
}

export function codeZuPreisliste(daten) {
  const ok =
    daten && daten.v === 1 && daten.t === 'p' &&
    istDatum(daten.s) && istCent(daten.p, 10000) &&
    Array.isArray(daten.g) && daten.g.length <= 100 &&
    daten.g.every((e) => Array.isArray(e) && istName(e[0]) && istCent(e[1], 100000) && (e[2] === 0 || e[2] === 1));
  if (!ok) throw new Error('Ungültige Preisliste');
  return {
    pfandCent: daten.p,
    pfandStandardAn: daten.d !== 0,
    zaehlen: daten.z === 1,
    pinHash: typeof daten.h === 'string' && /^[0-9a-f]{64}$/.test(daten.h) ? daten.h : null,
    getraenke: daten.g.map(([name, preisCent, pfand]) => ({ id: zufallsId(), name: name.trim(), preisCent, pfand: pfand === 1 })),
    stand: daten.s,
  };
}

export function abrechnungZuCode(a) {
  return kodiere({
    v: 1,
    t: 'a',
    i: a.id,
    n: a.name,
    s: a.start,
    e: a.ende,
    g: a.verkauft,
    gc: a.getraenkeCent,
    pa: a.pfandAus,
    pac: a.pfandAusCent,
    pz: a.pfandZurueck,
    pzc: a.pfandZurueckCent,
    b: a.bestellungen,
  });
}

export function codeZuAbrechnung(d) {
  const zahl = (x) => istCent(x, 100000000);
  const ok =
    d && d.v === 1 && d.t === 'a' &&
    typeof d.i === 'string' && d.i.length > 0 && d.i.length <= 40 &&
    typeof d.n === 'string' && d.n.length <= 60 &&
    istDatum(d.s) && istDatum(d.e) &&
    Array.isArray(d.g) && d.g.length <= 200 &&
    d.g.every((e) => Array.isArray(e) && istName(e[0]) && zahl(e[1]) && zahl(e[2])) &&
    [d.gc, d.pa, d.pac, d.pz, d.pzc, d.b].every(zahl);
  if (!ok) throw new Error('Ungültige Abrechnung');
  return {
    id: d.i,
    name: d.n,
    start: d.s,
    ende: d.e,
    verkauft: d.g.map(([n, anzahl, cent]) => [n, anzahl, cent]),
    getraenkeCent: d.gc,
    pfandAus: d.pa,
    pfandAusCent: d.pac,
    pfandZurueck: d.pz,
    pfandZurueckCent: d.pzc,
    bestellungen: d.b,
  };
}

// Liest einen geteilten Link oder den reinen Code. Ergebnis: { typ: 'preise' | 'abrechnung', daten }
export function leseCode(text) {
  const s = String(text || '').trim();
  const treffer = s.match(/#(?:preise|abrechnung)=([A-Za-z0-9_-]+)/);
  const code = treffer ? treffer[1] : s;
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('Kein gültiger Link oder Code');
  let roh;
  try {
    roh = dekodiere(code);
  } catch {
    throw new Error('Kein gültiger Link oder Code');
  }
  if (roh && roh.t === 'p') return { typ: 'preise', daten: codeZuPreisliste(roh) };
  if (roh && roh.t === 'a') return { typ: 'abrechnung', daten: codeZuAbrechnung(roh) };
  throw new Error('Kein gültiger Link oder Code');
}

// ---------- CSV (Semikolon, deutsches Zahlenformat) ----------

function csvFeld(x) {
  const s = String(x ?? '');
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function csv(z, { titel = 'Abrechnung', quellen = [], datum = (iso) => iso || '' } = {}) {
  const zeilen = [
    ['York:Wandelbar', titel],
    ['Zeitraum', datum(z.start), datum(z.ende)],
    ['Bestellungen', z.bestellungen],
    [],
    ['Getränk', 'Anzahl', 'Umsatz (EUR)'],
    ...z.verkauft.map((v) => [v.name, v.anzahl, csvZahl(v.cent)]),
    ['Getränke gesamt', z.getraenkeAnzahl, csvZahl(z.getraenkeCent)],
    [],
    ['Pfand ausgegeben', z.pfandAus, csvZahl(z.pfandAusCent)],
    ['Pfand zurück', z.pfandZurueck, csvZahl(-z.pfandZurueckCent)],
    ['Pfand-Saldo', '', csvZahl(z.pfandAusCent - z.pfandZurueckCent)],
    [],
    ['Kasseneinnahmen', '', csvZahl(z.einnahmenCent)],
  ];
  if (quellen.length) {
    zeilen.push([], ['Abrechnungen', 'Von', 'Bis', 'Bestellungen', 'Einnahmen (EUR)']);
    for (const q of quellen) {
      zeilen.push([q.name || '(ohne Name)', datum(q.start), datum(q.ende), q.bestellungen, csvZahl(einnahmen(q))]);
    }
  }
  return zeilen.map((r) => r.map(csvFeld).join(';')).join('\r\n') + '\r\n';
}
