import * as K from './kern.js';

const VERSION = globalThis.APP_VERSION || '?';
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Speicher (nur auf diesem Gerät) ----------

const PREFIX = 'wandelbar.';

function laden(key, fallback) {
  try {
    const s = localStorage.getItem(PREFIX + key);
    return s == null ? fallback : JSON.parse(s);
  } catch {
    return fallback;
  }
}

function speichern(key, wert) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(wert));
  } catch {
    // Speicher gesperrt (z. B. privater Modus) – die App läuft trotzdem, vergisst aber beim Neuladen.
  }
}

const S = {
  config: laden('config', null),
  abend: laden('abend', null) || K.neuerAbend(),
  gesamt: laden('gesamt', []),
  name: laden('name', ''),
  mitEigenem: laden('mitEigenem', true),
};
if (!S.config || !Array.isArray(S.config.getraenke)) S.config = K.standardConfig();
S.bestellung = laden('bestellung', null) || K.neueBestellung(S.config);
speichern('config', S.config);
speichern('abend', S.abend);
speichern('bestellung', S.bestellung);

// ---------- UI-Zustand ----------

let ansicht = 'kasse';
let entsperrt = false;
let entwurf = null; // Bearbeitungskopie der Preisliste
let ausstehend = null; // Import, der noch bestätigt werden muss
let gegebenCent = null; // Wechselgeld-Rechner
let teilenDaten = null;
let toastAktion = null;
let toastTimer = null;

const reihenfolge = () => S.config.getraenke.map((g) => g.name);
const anzahlText = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;
const linkBasis = () => location.origin + location.pathname;

// ---------- Datum ----------

const fmtDatum = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtZeit = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtTag = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });

const datum = (iso) => (iso ? fmtDatum.format(new Date(iso)) : '–');

function zeitraum(start, ende) {
  if (!start) return 'noch keine Bestellung';
  const s = new Date(start);
  const e = new Date(ende || start);
  if (fmtDatum.format(s) === fmtDatum.format(e)) return `${fmtDatum.format(s)} Uhr`;
  return s.toDateString() === e.toDateString()
    ? `${fmtDatum.format(s)} – ${fmtZeit.format(e)} Uhr`
    : `${fmtDatum.format(s)} – ${fmtDatum.format(e)}`;
}

// ---------- Navigation ----------

const ANSICHTEN = ['kasse', 'abend', 'gesamt', 'einstellungen'];

function zeige(name) {
  if (ansicht === 'einstellungen' && name !== 'einstellungen' && entwurfGeaendert()) {
    toast('Achtung: Preisänderungen sind noch nicht gespeichert');
  }
  ansicht = name;
  for (const v of ANSICHTEN) $('#ansicht-' + v).hidden = v !== name;
  document.querySelectorAll('.reiter button').forEach((b) => {
    if (b.dataset.ansicht === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const mitLeiste = name === 'kasse';
  $('#summenleiste').hidden = !mitLeiste;
  document.body.classList.toggle('mit-leiste', mitLeiste);
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (ansicht === 'kasse') renderKasse();
  else if (ansicht === 'abend') renderAbend();
  else if (ansicht === 'gesamt') renderGesamt();
  else renderEinstellungen();
}

// ---------- Kasse ----------

function renderKasse() {
  const { config, bestellung } = S;
  const sum = K.bestellSumme(bestellung, config);
  const knoepfe = config.getraenke.map((g) => {
    const n = bestellung.posten[g.id] || 0;
    return `<button type="button" class="getraenk${n ? ' gewaehlt' : ''}" data-action="plus" data-id="${esc(g.id)}"
        aria-label="${esc(g.name)}, ${K.euro(g.preisCent)}${n ? `, ${n} in der Bestellung` : ''}">
      <span class="g-name">${esc(g.name)}</span>
      <span class="g-unten"><span class="g-preis">${K.euro(g.preisCent)}</span>${g.pfand ? '<span class="g-pfand">+ Pfand</span>' : ''}</span>
      ${n ? `<span class="zaehler" aria-hidden="true">${n}</span>` : ''}
    </button>`;
  });

  $('#ansicht-kasse').innerHTML = `
    <div class="pfandschalter" role="group" aria-label="Pfand für diese Bestellung">
      <button type="button" class="an" data-action="pfand" data-wert="1" aria-pressed="${bestellung.mitPfand}">Mit Pfand</button>
      <button type="button" class="aus" data-action="pfand" data-wert="0" aria-pressed="${!bestellung.mitPfand}">Ohne Pfand</button>
    </div>
    ${knoepfe.length ? `<div class="raster">${knoepfe.join('')}</div>` : '<p class="karte klein">Noch keine Getränke angelegt. Unter „Preise“ kannst du welche hinzufügen.</p>'}
    <button type="button" class="pfand-zurueck" data-action="zurueck-plus">
      <span>↩ Pfand zurück <span class="einzel">je ${K.euro(-config.pfandCent)}</span></span>
      ${sum.zurueck ? `<span class="zaehler">${sum.zurueck}</span>` : ''}
    </button>
    <section class="karte bon" aria-label="Bestellung">${bonHtml(sum)}</section>`;
  renderLeiste(sum);
}

function bonHtml(sum) {
  if (sum.leer) return '<p class="bon-leer">Getränke antippen, um eine Bestellung zu beginnen.</p>';
  const zeilen = sum.zeilen.map((z) => `
    <div class="bon-zeile">
      <span class="text">${z.anzahl}× ${esc(z.name)} <span class="einzel">à ${K.euro(z.einzelCent)}</span></span>
      <span class="betrag">${K.euro(z.cent)}</span>
      <button type="button" class="minus" data-action="minus" data-id="${esc(z.id)}" aria-label="${esc(z.name)}: eins weniger">−</button>
    </div>`);
  const hatPfandGetraenk = sum.zeilen.some((z) => S.config.getraenke.find((g) => g.id === z.id)?.pfand);
  if (S.bestellung.mitPfand && sum.pfandAnzahl) {
    zeilen.push(`<div class="bon-zeile pfand"><span class="text">Pfand ${sum.pfandAnzahl}× ${K.euro(S.config.pfandCent)}</span><span class="betrag">${K.euro(sum.pfandCent)}</span><span class="platzhalter"></span></div>`);
  } else if (!S.bestellung.mitPfand && hatPfandGetraenk) {
    zeilen.push('<div class="bon-zeile hinweis"><span class="text">ohne Pfand</span><span></span><span class="platzhalter"></span></div>');
  }
  if (sum.zurueck) {
    zeilen.push(`<div class="bon-zeile pfand"><span class="text">Pfand zurück ${sum.zurueck}×</span><span class="betrag">${K.euro(-sum.zurueckCent)}</span><button type="button" class="minus" data-action="zurueck-minus" aria-label="Eine Pfandrückgabe weniger">−</button></div>`);
  }
  return zeilen.join('');
}

function renderLeiste(sum) {
  const auszahlen = sum.summeCent < 0;
  $('#summenleiste').innerHTML = `
    <div class="leiste-innen">
      <div aria-live="polite">
        <span class="summe-label">${auszahlen ? 'Auszahlen' : 'Summe'}</span>
        <span class="summe-betrag${auszahlen ? ' auszahlen' : ''}">${K.euro(Math.abs(sum.summeCent))}</span>
      </div>
      <button type="button" class="knopf" data-action="leeren" ${sum.leer ? 'disabled' : ''}>Leeren</button>
      <button type="button" class="knopf primaer" data-action="kassieren" ${sum.leer ? 'disabled' : ''}>Kassieren</button>
    </div>`;
}

function bestellungGeaendert() {
  speichern('bestellung', S.bestellung);
  renderKasse();
}

function tippen() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // egal
  }
}

function oeffneKassieren() {
  const sum = K.bestellSumme(S.bestellung, S.config);
  if (sum.leer) return;
  gegebenCent = null;
  const s = sum.summeCent;
  let inhalt;
  if (s > 0) {
    const schnell = K.schnellBetraege(s)
      .map((c) => `<button type="button" class="knopf" data-action="gegeben" data-cent="${c}" aria-pressed="false">${K.euro(c).replace(',00', '')}</button>`)
      .join('');
    inhalt = `
      <p class="zu-zahlen">Zu zahlen <strong>${K.euro(s)}</strong></p>
      <p class="klein">Gegeben:</p>
      <div class="schnell">
        <button type="button" class="knopf" data-action="gegeben" data-cent="${s}" aria-pressed="false">Passend</button>
        ${schnell}
      </div>
      <label class="feld">Anderer Betrag
        <input id="gegeben-eingabe" class="eingabe" inputmode="decimal" autocomplete="off" placeholder="z. B. 12,50">
      </label>
      <div id="rueckgeld" class="rueckgeld" aria-live="polite">Rückgeld erscheint hier</div>`;
  } else if (s < 0) {
    inhalt = `<p class="zu-zahlen auszahlen">Pfand auszahlen <strong>${K.euro(-s)}</strong></p>
      <p class="klein">Gib dem Gast den Betrag aus der Kasse.</p>`;
  } else {
    inhalt = `<p class="zu-zahlen">Nichts zu zahlen <strong>${K.euro(0)}</strong></p>`;
  }
  oeffneDialog(`
    <h2 id="dialog-titel">${s < 0 ? 'Auszahlen' : 'Kassieren'}</h2>
    ${inhalt}
    <div class="aktionen">
      <button type="button" class="knopf" data-action="dialog-schliessen">Zurück</button>
      <button type="button" class="knopf primaer" data-action="buchen">Fertig ✓</button>
    </div>`);
}

function zeigeRueckgeld() {
  const el = $('#rueckgeld');
  if (!el) return;
  const frei = $('#gegeben-eingabe')?.value.trim();
  document.querySelectorAll('.schnell .knopf').forEach((b) => {
    b.setAttribute('aria-pressed', String(!frei && Number(b.dataset.cent) === gegebenCent));
  });
  if (gegebenCent == null) {
    el.className = 'rueckgeld';
    el.textContent = frei ? 'Betrag nicht lesbar' : 'Rückgeld erscheint hier';
    return;
  }
  const r = K.rueckgeld(K.bestellSumme(S.bestellung, S.config).summeCent, gegebenCent);
  el.className = r >= 0 ? 'rueckgeld gut' : 'rueckgeld fehlt';
  el.innerHTML = r >= 0 ? `Rückgeld<strong>${K.euro(r)}</strong>` : `Es fehlen<strong>${K.euro(-r)}</strong>`;
}

function buchen() {
  const sum = K.bestellSumme(S.bestellung, S.config);
  schliesseDialog();
  if (sum.leer) return;
  S.abend = K.abendBuchen(S.abend, K.buchungAus(sum));
  S.bestellung = K.neueBestellung(S.config);
  speichern('abend', S.abend);
  speichern('bestellung', S.bestellung);
  render();
  toast(sum.summeCent < 0 ? `Ausgezahlt: ${K.euro(-sum.summeCent)}` : `Gebucht: ${K.euro(sum.summeCent)}`);
}

// ---------- Abend ----------

function uebersichtHtml(z, titel) {
  const saldo = z.pfandAusCent - z.pfandZurueckCent;
  const getraenke = z.verkauft.length
    ? `<table>
        <thead><tr><th>Getränk</th><th class="zahl">Anzahl</th><th class="zahl">Umsatz</th></tr></thead>
        <tbody>${z.verkauft.map((v) => `<tr><td>${esc(v.name)}</td><td class="zahl">${v.anzahl}</td><td class="zahl">${K.euro(v.cent)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Gesamt</td><td class="zahl">${z.getraenkeAnzahl}</td><td class="zahl">${K.euro(z.getraenkeCent)}</td></tr></tfoot>
      </table>`
    : '<p class="klein">Noch nichts verkauft.</p>';
  return `
    <section class="karte einnahmen-karte">
      <span class="summe-label">${titel}</span>
      <span class="summe-betrag">${K.euro(z.einnahmenCent)}</span>
      <span class="meta">${anzahlText(z.bestellungen, 'Bestellung', 'Bestellungen')} · ${zeitraum(z.start, z.ende)}</span>
    </section>
    <section class="karte"><h3>Getränke</h3>${getraenke}</section>
    <section class="karte">
      <h3>Pfand</h3>
      <table>
        <tbody>
          <tr><td>Ausgegeben</td><td class="zahl">${z.pfandAus}×</td><td class="zahl">${K.euro(z.pfandAusCent)}</td></tr>
          <tr><td>Zurückgenommen</td><td class="zahl">${z.pfandZurueck}×</td><td class="zahl">${K.euro(-z.pfandZurueckCent)}</td></tr>
        </tbody>
        <tfoot><tr><td>Saldo</td><td></td><td class="zahl">${K.euro(saldo)}</td></tr></tfoot>
      </table>
      <p class="klein fuss">Der Saldo ist Pfandgeld für Gläser, die noch nicht zurück sind.${saldo < 0 ? ' Negativ heißt: Es kam mehr Pfand zurück als ausgegeben wurde (z. B. Gläser vom Vortag).' : ''}</p>
    </section>`;
}

function renderAbend() {
  const a = K.abrechnungAusAbend(S.abend, S.name);
  const z = K.zusammenfuehren([a], reihenfolge());
  const leer = z.bestellungen === 0;
  $('#ansicht-abend').innerHTML = `
    <section class="karte">
      <label class="feld">Dein Name <span class="klein">(steht auf der Abrechnung)</span>
        <input id="name-eingabe" class="eingabe" value="${esc(S.name)}" maxlength="60" autocomplete="given-name" placeholder="z. B. Anna">
      </label>
    </section>
    ${uebersichtHtml(z, 'Kasseneinnahmen auf diesem Handy')}
    <div class="knopfleiste">
      <button type="button" class="knopf primaer voll" data-action="abrechnung-senden" ${leer ? 'disabled' : ''}>Abrechnung an Kassenwart senden</button>
      <button type="button" class="knopf voll" data-action="storno" ${S.abend.letzte ? '' : 'disabled'}>Letzte Bestellung stornieren</button>
      <button type="button" class="knopf voll" data-action="csv-abend" ${leer ? 'disabled' : ''}>Als CSV herunterladen</button>
      <button type="button" class="knopf gefahr voll" data-action="neuer-abend" ${leer ? 'disabled' : ''}>Neuen Abend starten</button>
    </div>`;
}

function abrechnungSenden() {
  const a = K.abrechnungAusAbend(S.abend, S.name);
  oeffneTeilen({
    titel: 'Abrechnung senden',
    erklaerung: 'Schick den Link an den Kassenwart (z. B. per WhatsApp) oder lass ihn den QR-Code mit der Handykamera scannen. Er übernimmt die Abrechnung dann unter „Gesamt“.',
    hinweis: S.name ? '' : 'Tipp: Trag unter „Abend“ deinen Namen ein, damit der Kassenwart weiß, von wem die Abrechnung ist.',
    link: `${linkBasis()}#abrechnung=${K.abrechnungZuCode(a)}`,
    text: `York:Wandelbar – Abrechnung von ${S.name || 'ohne Namen'}: ${K.euro(K.einnahmen(a))}, ${anzahlText(a.bestellungen, 'Bestellung', 'Bestellungen')}`,
    fertig: () => {
      S.abend.gesendet = true;
      speichern('abend', S.abend);
    },
  });
}

function stornoFragen() {
  const l = S.abend.letzte;
  if (!l) return;
  const teile = l.posten.map(([n, anzahl]) => `${anzahl}× ${esc(n)}`);
  if (l.pfandAus) teile.push(`${l.pfandAus}× Pfand`);
  if (l.pfandZurueck) teile.push(`${l.pfandZurueck}× Pfand zurück`);
  const betrag = l.posten.reduce((s, [, , c]) => s + c, 0) + l.pfandAusCent - l.pfandZurueckCent;
  bestaetige({
    titel: 'Letzte Bestellung stornieren?',
    text: `<p>${teile.join(', ')}</p><p class="zu-zahlen">Betrag <strong>${K.euro(betrag)}</strong></p>`,
    ja: 'Stornieren',
    aktion: 'storno-ja',
    gefahr: true,
  });
}

function neuerAbendFragen() {
  bestaetige({
    titel: 'Neuen Abend starten?',
    text: `${S.abend.gesendet ? '' : '<p class="warnung">Die Abrechnung wurde von hier noch nicht geteilt. Schick sie vorher an den Kassenwart oder lass den QR-Code scannen.</p>'}
      <p>Die Zählung auf diesem Handy wird auf null gesetzt.</p>`,
    ja: 'Neu starten',
    aktion: 'neuer-abend-ja',
    gefahr: true,
  });
}

// ---------- Gesamt (Kassenwart) ----------

function gesamtQuellen() {
  const quellen = [...S.gesamt];
  if (S.mitEigenem && S.abend.bestellungen > 0) {
    quellen.push(K.abrechnungAusAbend(S.abend, S.name ? `${S.name} (dieses Handy)` : 'Dieses Handy'));
  }
  return quellen;
}

function renderGesamt() {
  const z = K.zusammenfuehren(gesamtQuellen(), reihenfolge());
  const liste = S.gesamt.length
    ? S.gesamt.map((a) => `
        <div class="quelle">
          <div><div class="name">${esc(a.name || '(ohne Name)')}</div><div class="klein">${zeitraum(a.start, a.ende)} · ${a.bestellungen} Best.</div></div>
          <strong>${K.euro(K.einnahmen(a))}</strong>
          <button type="button" class="mini gefahr" data-action="quelle-entfernen" data-id="${esc(a.id)}" aria-label="Abrechnung von ${esc(a.name || 'ohne Name')} entfernen">✕</button>
        </div>`).join('')
    : '<p class="klein">Noch keine Abrechnungen übernommen.</p>';

  $('#ansicht-gesamt').innerHTML = `
    <section class="karte">
      <h3>Abrechnungen sammeln</h3>
      <p class="klein">Für den Kassenwart: Am Ende des Abends schicken alle ihre Abrechnung als Link. Öffne die Links oder scanne die QR-Codes mit der Kamera, dann landen sie hier. Klappt das nicht, füge den Link hier ein:</p>
      ${importFormHtml()}
    </section>
    <section class="karte">
      <h3>Übernommen (${S.gesamt.length})</h3>
      ${liste}
      <label class="check"><input type="checkbox" id="mit-eigenem" ${S.mitEigenem ? 'checked' : ''}>
        Eigenen Abend von diesem Handy mitzählen${S.abend.bestellungen ? ` (${K.euro(K.einnahmen(S.abend))})` : ''}</label>
    </section>
    ${uebersichtHtml(z, 'Einnahmen gesamt')}
    <div class="knopfleiste">
      <button type="button" class="knopf voll" data-action="csv-gesamt" ${z.bestellungen ? '' : 'disabled'}>Als CSV herunterladen</button>
      <button type="button" class="knopf gefahr voll" data-action="gesamt-leeren" ${S.gesamt.length ? '' : 'disabled'}>Liste leeren</button>
    </div>`;
}

const importFormHtml = () => `
  <form class="zeile-eingabe" data-form="import">
    <input class="eingabe" name="code" placeholder="Link oder Code einfügen" autocomplete="off" aria-label="Link oder Code">
    <button class="knopf primaer">Übernehmen</button>
  </form>`;

// ---------- Import von Links ----------

function importiere(text, ausLink = false) {
  let ergebnis;
  try {
    ergebnis = K.leseCode(text);
  } catch (err) {
    if (ausLink) info('Link nicht lesbar', `<p>${esc(err.message)}. Vielleicht wurde der Link beim Kopieren abgeschnitten.</p>`);
    else toast(err.message);
    return;
  }
  if (ergebnis.typ === 'preise') zeigePreisImport(ergebnis.daten);
  else zeigeAbrechnungImport(ergebnis.daten);
}

const vergleichbar = (c) => JSON.stringify([c.pfandCent, c.pfandStandardAn, c.pinHash, c.getraenke.map((g) => [g.name, g.preisCent, g.pfand])]);

function zeigePreisImport(p) {
  if (vergleichbar(p) === vergleichbar(S.config)) {
    info('Preisliste ist aktuell', '<p>Genau diese Preisliste hast du schon.</p>');
    return;
  }
  const aelter = p.stand && S.config.stand && p.stand < S.config.stand;
  oeffneDialog(`
    <h2 id="dialog-titel">Neue Preisliste übernehmen?</h2>
    <p class="klein">Stand ${datum(p.stand)} · Pfand ${K.euro(p.pfandCent)}</p>
    ${aelter ? `<p class="warnung">Achtung: Diese Liste ist älter als deine aktuelle (Stand ${datum(S.config.stand)}).</p>` : ''}
    <table>
      <thead><tr><th>Getränk</th><th class="zahl">Preis</th><th class="zahl">Pfand</th></tr></thead>
      <tbody>${p.getraenke.map((g) => `<tr><td>${esc(g.name)}</td><td class="zahl">${K.euro(g.preisCent)}</td><td class="zahl">${g.pfand ? '✓' : '–'}</td></tr>`).join('')}</tbody>
    </table>
    <div class="aktionen">
      <button type="button" class="knopf" data-action="dialog-schliessen">Abbrechen</button>
      <button type="button" class="knopf primaer" data-action="preise-uebernehmen">Übernehmen</button>
    </div>`);
  ausstehend = p;
}

function preiseUebernehmen() {
  const neu = ausstehend;
  schliesseDialog();
  if (!neu) return;
  // Offene Bestellung über die Namen auf die neuen IDs umhängen
  const nameZuId = new Map(neu.getraenke.map((g) => [g.name, g.id]));
  const posten = {};
  for (const g of S.config.getraenke) {
    const n = S.bestellung.posten[g.id];
    const id = nameZuId.get(g.name);
    if (n && id) posten[id] = n;
  }
  S.bestellung.posten = posten;
  S.config = neu;
  entwurf = null;
  entsperrt = false;
  speichern('config', S.config);
  speichern('bestellung', S.bestellung);
  zeige('kasse');
  toast('Neue Preisliste übernommen');
}

function zeigeAbrechnungImport(a) {
  if (a.id === S.abend.id) {
    info('Eigene Abrechnung', '<p>Das ist die Abrechnung von diesem Handy. Sie zählt unter „Gesamt“ über „Eigenen Abend mitzählen“ mit.</p>');
    return;
  }
  const vorhanden = S.gesamt.find((x) => x.id === a.id);
  if (vorhanden && JSON.stringify(vorhanden) === JSON.stringify(a)) {
    info('Schon übernommen', `<p>Die Abrechnung von ${esc(a.name || '(ohne Name)')} ist schon in der Gesamtliste.</p>`);
    return;
  }
  const vorhandenNeuer = vorhanden && (vorhanden.ende || '') > (a.ende || '');
  oeffneDialog(`
    <h2 id="dialog-titel">Abrechnung übernehmen?</h2>
    <p><strong>${esc(a.name || '(ohne Name)')}</strong><br><span class="klein">${zeitraum(a.start, a.ende)}</span></p>
    <p class="zu-zahlen">Einnahmen <strong>${K.euro(K.einnahmen(a))}</strong></p>
    <p class="klein">${anzahlText(a.bestellungen, 'Bestellung', 'Bestellungen')} · ${anzahlText(a.verkauft.reduce((s, [, n]) => s + n, 0), 'Getränk', 'Getränke')}</p>
    ${vorhanden ? `<p class="${vorhandenNeuer ? 'warnung' : 'info'}">Von dieser Abrechnung gibt es schon eine ${vorhandenNeuer ? 'NEUERE' : 'ältere'} Version (${K.euro(K.einnahmen(vorhanden))}). Sie wird ersetzt.</p>` : ''}
    <div class="aktionen">
      <button type="button" class="knopf" data-action="dialog-schliessen">Abbrechen</button>
      <button type="button" class="knopf primaer" data-action="abrechnung-uebernehmen">Übernehmen</button>
    </div>`);
  ausstehend = a;
}

function abrechnungUebernehmen() {
  const a = ausstehend;
  schliesseDialog();
  if (!a) return;
  const i = S.gesamt.findIndex((x) => x.id === a.id);
  if (i >= 0) S.gesamt[i] = a;
  else S.gesamt.push(a);
  speichern('gesamt', S.gesamt);
  zeige('gesamt');
  toast(`Abrechnung von ${a.name || '(ohne Name)'} übernommen`);
}

function pruefeLink() {
  const h = location.hash;
  if (!/^#(preise|abrechnung)=/.test(h)) return;
  history.replaceState(null, '', location.pathname + location.search);
  importiere(h, true);
}

// ---------- Einstellungen ----------

const entwurfAus = (c) => ({
  pfand: K.csvZahl(c.pfandCent),
  pfandStandardAn: c.pfandStandardAn,
  getraenke: c.getraenke.map((g) => ({ id: g.id, name: g.name, preis: K.csvZahl(g.preisCent), pfand: g.pfand })),
});

const entwurfGeaendert = () => entwurf && JSON.stringify(entwurf) !== JSON.stringify(entwurfAus(S.config));

function renderEinstellungen() {
  const el = $('#ansicht-einstellungen');
  const ueber = `
    <section class="karte">
      <h3>Über diese Kasse</h3>
      <p class="klein">Alle Daten bleiben auf diesem Handy. Es wird nichts an einen Server geschickt, nur die Links, die du selbst teilst, enthalten Preise oder Abrechnungen.</p>
      <p class="klein">Version ${esc(VERSION)}</p>
    </section>`;

  if (!entsperrt) {
    el.innerHTML = `
      <section class="karte">
        <h3>Getränke &amp; Preise ändern</h3>
        <p class="klein">Nur mit PIN, damit an der Theke nichts aus Versehen verstellt wird.</p>
        <form class="zeile-eingabe" data-form="pin">
          <input class="eingabe" name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" aria-label="PIN" required>
          <button class="knopf primaer">Entsperren</button>
        </form>
        <p id="pin-fehler" class="warnung fuss" hidden>Falsche PIN.</p>
      </section>
      <section class="karte">
        <h3>Neue Preisliste bekommen</h3>
        <p class="klein">Hat jemand die Preise geändert, öffne den Link oder scanne den QR-Code mit der Kamera. Nutzt du die Kasse auf dem iPhone über ein Symbol auf dem Home-Bildschirm, füge den Link lieber hier ein:</p>
        ${importFormHtml()}
        <p class="klein fuss">Deine Preisliste: ${S.config.stand ? `Stand ${datum(S.config.stand)}` : 'Beispielwerte, noch nie geändert'} · ${S.config.getraenke.length} Getränke</p>
      </section>
      ${ueber}`;
    return;
  }

  if (!entwurf) entwurf = entwurfAus(S.config);
  const n = entwurf.getraenke.length;
  const zeilen = entwurf.getraenke.map((g, i) => `
    <div class="edit-zeile" data-index="${i}">
      <input class="eingabe e-name" data-feld="name" value="${esc(g.name)}" maxlength="40" placeholder="Name" aria-label="Name">
      <input class="eingabe e-preis" data-feld="preis" value="${esc(g.preis)}" inputmode="decimal" placeholder="0,00" aria-label="Preis in Euro">
      <div class="e-optionen">
        <label class="check"><input type="checkbox" data-feld="pfand" ${g.pfand ? 'checked' : ''}> Pfand</label>
        <button type="button" class="mini" data-action="e-hoch" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
        <button type="button" class="mini" data-action="e-runter" ${i === n - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button>
        <button type="button" class="mini gefahr" data-action="e-loeschen" aria-label="Löschen">✕</button>
      </div>
    </div>`).join('');

  el.innerHTML = `
    ${S.config.pinHash ? '' : '<p class="warnung">Die Kasse nutzt noch die Standard-PIN 1234. Bitte unten ändern.</p>'}
    <section class="karte">
      <h3>Getränke</h3>
      <div class="edit-liste">${zeilen}</div>
      <button type="button" class="knopf voll fuss" data-action="e-neu">+ Getränk hinzufügen</button>
    </section>
    <section class="karte">
      <h3>Pfand</h3>
      <label class="feld">Pfand pro Glas oder Flasche (€)
        <input class="eingabe" data-feld="pfandbetrag" value="${esc(entwurf.pfand)}" inputmode="decimal">
      </label>
      <p class="klein fuss">Voreinstellung für jede neue Bestellung:</p>
      <div class="pfandschalter">
        <button type="button" class="an" data-action="e-pfand-standard" data-wert="1" aria-pressed="${entwurf.pfandStandardAn}">Mit Pfand</button>
        <button type="button" class="aus" data-action="e-pfand-standard" data-wert="0" aria-pressed="${!entwurf.pfandStandardAn}">Ohne Pfand</button>
      </div>
    </section>
    <p id="e-fehler" class="warnung" hidden></p>
    <div class="knopfleiste">
      <button type="button" class="knopf primaer voll" data-action="e-speichern">Speichern</button>
      <button type="button" class="knopf voll" data-action="e-verwerfen">Änderungen verwerfen</button>
    </div>
    <section class="karte">
      <h3>Preisliste an die anderen Handys geben</h3>
      <p class="klein">Nach dem Speichern den QR-Code zeigen oder den Link in die Team-Gruppe schicken. Die anderen öffnen ihn und tippen auf „Übernehmen“.</p>
      <button type="button" class="knopf primaer voll" data-action="preise-teilen">QR-Code / Link anzeigen</button>
    </section>
    <section class="karte">
      <h3>PIN ändern</h3>
      <form data-form="pin-neu" class="edit-liste">
        <div class="zweispaltig">
          <input class="eingabe" name="pin1" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Neue PIN" aria-label="Neue PIN" required>
          <input class="eingabe" name="pin2" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Wiederholen" aria-label="Neue PIN wiederholen" required>
        </div>
        <button class="knopf voll">PIN speichern</button>
      </form>
      <p class="klein fuss">Die PIN schützt nur vor versehentlichen Änderungen. Die Seite ist öffentlich, wer sich mit Webseiten auskennt, kommt auch ohne PIN weiter. Die PIN wird mit der Preisliste an die anderen Handys weitergegeben.</p>
    </section>
    <button type="button" class="knopf voll" data-action="sperren">Einstellungen sperren</button>
    ${ueber}`;
}

async function pinHash(pin) {
  const daten = new TextEncoder().encode('wandelbar:' + pin);
  const hash = await crypto.subtle.digest('SHA-256', daten);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function entsperren(form) {
  const pin = form.elements.pin.value.trim();
  let ok;
  try {
    ok = S.config.pinHash ? (await pinHash(pin)) === S.config.pinHash : pin === K.PIN_STANDARD;
  } catch {
    toast('PIN-Prüfung braucht eine sichere Verbindung (https)');
    return;
  }
  if (!ok) {
    form.elements.pin.value = '';
    $('#pin-fehler').hidden = false;
    return;
  }
  entsperrt = true;
  entwurf = entwurfAus(S.config);
  renderEinstellungen();
}

async function pinAendern(form) {
  const p1 = form.elements.pin1.value.trim();
  const p2 = form.elements.pin2.value.trim();
  if (!/^\d{4,8}$/.test(p1)) return toast('Die PIN muss aus 4 bis 8 Ziffern bestehen');
  if (p1 !== p2) return toast('Die beiden Eingaben sind verschieden');
  try {
    S.config = { ...S.config, pinHash: await pinHash(p1), stand: new Date().toISOString() };
  } catch {
    return toast('PIN ändern braucht eine sichere Verbindung (https)');
  }
  speichern('config', S.config);
  renderEinstellungen();
  toast('PIN geändert. Gib sie mit der Preisliste an die anderen weiter.');
}

function entwurfSpeichern() {
  if (!entwurfGeaendert()) return toast('Keine Änderungen');
  document.querySelectorAll('.eingabe.falsch').forEach((e) => e.classList.remove('falsch'));
  const fehler = [];
  const markiere = (i, feld) => document.querySelector(`.edit-zeile[data-index="${i}"] [data-feld="${feld}"]`)?.classList.add('falsch');
  const namen = new Set();
  const getraenke = entwurf.getraenke.map((g, i) => {
    const name = g.name.trim();
    const preisCent = K.parseEuro(g.preis);
    if (!name) {
      fehler.push(`Getränk ${i + 1}: Name fehlt`);
      markiere(i, 'name');
    } else if (namen.has(name.toLowerCase())) {
      fehler.push(`„${name}“ gibt es doppelt`);
      markiere(i, 'name');
    }
    namen.add(name.toLowerCase());
    if (preisCent == null || preisCent > 100000) {
      fehler.push(`${name || `Getränk ${i + 1}`}: Preis ungültig`);
      markiere(i, 'preis');
    }
    return { id: g.id, name, preisCent, pfand: g.pfand };
  });
  const pfandCent = K.parseEuro(entwurf.pfand);
  if (pfandCent == null || pfandCent > 10000) {
    fehler.push('Pfandbetrag ungültig');
    document.querySelector('[data-feld="pfandbetrag"]')?.classList.add('falsch');
  }
  if (fehler.length) {
    const el = $('#e-fehler');
    el.textContent = fehler.join(' · ');
    el.hidden = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  S.config = { ...S.config, pfandCent, pfandStandardAn: entwurf.pfandStandardAn, getraenke, stand: new Date().toISOString() };
  for (const id of Object.keys(S.bestellung.posten)) {
    if (!getraenke.some((g) => g.id === id)) delete S.bestellung.posten[id];
  }
  speichern('config', S.config);
  speichern('bestellung', S.bestellung);
  entwurf = entwurfAus(S.config);
  renderEinstellungen();
  toast('Gespeichert. Jetzt noch an die anderen Handys geben.');
}

function entwurfZeile(btn) {
  return Number(btn.closest('.edit-zeile')?.dataset.index);
}

function verschiebe(i, richtung) {
  const j = i + richtung;
  const g = entwurf.getraenke;
  if (j < 0 || j >= g.length) return;
  [g[i], g[j]] = [g[j], g[i]];
  renderEinstellungen();
}

function preiseTeilen() {
  if (entwurfGeaendert()) return toast('Bitte zuerst speichern');
  oeffneTeilen({
    titel: 'Preisliste teilen',
    erklaerung: 'Die anderen scannen den QR-Code mit der Handykamera oder öffnen den Link und tippen auf „Übernehmen“.',
    link: `${linkBasis()}#preise=${K.preislisteZuCode(S.config)}`,
    text: 'York:Wandelbar – neue Preisliste für die Kasse',
  });
}

// ---------- Dialoge, Teilen, Toast ----------

const dialog = $('#dialog');

function oeffneDialog(html) {
  dialog.innerHTML = `<div class="dialog-innen">${html}</div>`;
  if (!dialog.open) dialog.showModal();
}

function schliesseDialog() {
  if (dialog.open) dialog.close();
}

dialog.addEventListener('close', () => {
  dialog.innerHTML = '';
  ausstehend = null;
  teilenDaten = null;
});

// Tipp auf den abgedunkelten Hintergrund schließt
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) schliesseDialog();
});

function info(titel, html) {
  oeffneDialog(`<h2 id="dialog-titel">${esc(titel)}</h2>${html}
    <div class="aktionen eins"><button type="button" class="knopf primaer" data-action="dialog-schliessen">OK</button></div>`);
}

function bestaetige({ titel, text, ja, aktion, gefahr = false }) {
  oeffneDialog(`<h2 id="dialog-titel">${esc(titel)}</h2>${text}
    <div class="aktionen">
      <button type="button" class="knopf" data-action="dialog-schliessen">Abbrechen</button>
      <button type="button" class="knopf ${gefahr ? 'gefahr' : 'primaer'}" data-action="${aktion}">${esc(ja)}</button>
    </div>`);
}

function qrSvg(text) {
  if (typeof globalThis.qrcode !== 'function') return '<p class="klein">QR-Code nicht verfügbar.</p>';
  for (const stufe of ['M', 'L']) {
    try {
      const qr = globalThis.qrcode(0, stufe);
      qr.addData(text);
      qr.make();
      return `<div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true, title: 'QR-Code' })}</div>`;
    } catch {
      // zu viele Daten für diese Stufe
    }
  }
  return '<p class="warnung">Zu viele Daten für einen QR-Code. Bitte den Link teilen.</p>';
}

function oeffneTeilen({ titel, erklaerung, hinweis = '', link, text, fertig }) {
  const kannTeilen = typeof navigator.share === 'function';
  oeffneDialog(`
    <h2 id="dialog-titel">${esc(titel)}</h2>
    <p class="klein">${esc(erklaerung)}</p>
    ${hinweis ? `<p class="info">${esc(hinweis)}</p>` : ''}
    ${qrSvg(link)}
    <div class="aktionen${kannTeilen ? '' : ' eins'}">
      ${kannTeilen ? '<button type="button" class="knopf primaer" data-action="teilen">Teilen …</button>' : ''}
      <button type="button" class="knopf${kannTeilen ? '' : ' primaer'}" data-action="kopieren">Link kopieren</button>
    </div>
    <details class="fuss"><summary class="klein">Link anzeigen</summary>
      <input class="eingabe fuss" readonly value="${esc(link)}" aria-label="Link" onfocus="this.select()">
    </details>
    <div class="aktionen eins"><button type="button" class="knopf" data-action="dialog-schliessen">Schließen</button></div>`);
  teilenDaten = { titel, link, text, fertig };
}

async function teilen() {
  const d = teilenDaten;
  if (!d) return;
  try {
    await navigator.share({ title: d.titel, text: d.text, url: d.link });
    d.fertig?.();
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Teilen hat nicht geklappt. Kopiere den Link.');
  }
}

async function kopieren() {
  const d = teilenDaten;
  if (!d) return;
  try {
    await navigator.clipboard.writeText(d.link);
    d.fertig?.();
    toast('Link kopiert');
  } catch {
    const feld = dialog.querySelector('details');
    if (feld) {
      feld.open = true;
      feld.querySelector('input')?.select();
    }
    toast('Kopieren nicht möglich. Link bitte von Hand markieren.');
  }
}

function toast(text, aktion) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${aktion ? `<button type="button" data-action="toast-aktion">${esc(aktion.text)}</button>` : ''}`;
  toastAktion = aktion?.fn || null;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
    toastAktion = null;
  }, aktion ? 5000 : 2500);
}

function ladeCsv(art, z, optionen) {
  const text = K.csv(z, { ...optionen, datum });
  const tag = fmtTag.format(z.start ? new Date(z.start) : new Date());
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wandelbar-${art}-${tag}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Aktionen ----------

const AKTIONEN = {
  plus(btn) {
    const id = btn.dataset.id;
    S.bestellung.posten[id] = (S.bestellung.posten[id] || 0) + 1;
    tippen();
    bestellungGeaendert();
  },
  minus(btn) {
    const id = btn.dataset.id;
    const n = (S.bestellung.posten[id] || 0) - 1;
    if (n > 0) S.bestellung.posten[id] = n;
    else delete S.bestellung.posten[id];
    bestellungGeaendert();
  },
  pfand(btn) {
    S.bestellung.mitPfand = btn.dataset.wert === '1';
    bestellungGeaendert();
  },
  'zurueck-plus'() {
    S.bestellung.zurueck = (S.bestellung.zurueck || 0) + 1;
    tippen();
    bestellungGeaendert();
  },
  'zurueck-minus'() {
    S.bestellung.zurueck = Math.max(0, (S.bestellung.zurueck || 0) - 1);
    bestellungGeaendert();
  },
  leeren() {
    const alt = S.bestellung;
    S.bestellung = K.neueBestellung(S.config);
    bestellungGeaendert();
    toast('Bestellung verworfen', {
      text: 'Rückgängig',
      fn: () => {
        S.bestellung = alt;
        bestellungGeaendert();
      },
    });
  },
  kassieren: oeffneKassieren,
  gegeben(btn) {
    gegebenCent = Number(btn.dataset.cent);
    const feld = $('#gegeben-eingabe');
    if (feld) feld.value = '';
    zeigeRueckgeld();
  },
  buchen,
  'dialog-schliessen': schliesseDialog,
  'toast-aktion'() {
    const fn = toastAktion;
    $('#toast').hidden = true;
    toastAktion = null;
    fn?.();
  },

  'abrechnung-senden': abrechnungSenden,
  storno: stornoFragen,
  'storno-ja'() {
    S.abend = K.abendStornieren(S.abend);
    speichern('abend', S.abend);
    schliesseDialog();
    render();
    toast('Letzte Bestellung storniert');
  },
  'csv-abend'() {
    const a = K.abrechnungAusAbend(S.abend, S.name);
    ladeCsv('abend', K.zusammenfuehren([a], reihenfolge()), { titel: `Abrechnung ${S.name || 'ohne Namen'}` });
  },
  'neuer-abend': neuerAbendFragen,
  'neuer-abend-ja'() {
    S.abend = K.neuerAbend();
    speichern('abend', S.abend);
    schliesseDialog();
    render();
    toast('Neuer Abend gestartet');
  },

  'quelle-entfernen'(btn) {
    S.gesamt = S.gesamt.filter((a) => a.id !== btn.dataset.id);
    speichern('gesamt', S.gesamt);
    renderGesamt();
  },
  'csv-gesamt'() {
    const quellen = gesamtQuellen();
    ladeCsv('gesamt', K.zusammenfuehren(quellen, reihenfolge()), { titel: 'Gesamtabrechnung', quellen });
  },
  'gesamt-leeren'() {
    bestaetige({
      titel: 'Gesamtliste leeren?',
      text: '<p>Alle übernommenen Abrechnungen werden von diesem Handy entfernt. Die Zählung dieses Handys bleibt.</p>',
      ja: 'Leeren',
      aktion: 'gesamt-leeren-ja',
      gefahr: true,
    });
  },
  'gesamt-leeren-ja'() {
    S.gesamt = [];
    speichern('gesamt', S.gesamt);
    schliesseDialog();
    renderGesamt();
  },
  'preise-uebernehmen': preiseUebernehmen,
  'abrechnung-uebernehmen': abrechnungUebernehmen,

  teilen,
  kopieren,
  'preise-teilen': preiseTeilen,
  'e-neu'() {
    entwurf.getraenke.push({ id: K.zufallsId(), name: '', preis: '', pfand: true });
    renderEinstellungen();
    const felder = document.querySelectorAll('.edit-zeile .e-name');
    felder[felder.length - 1]?.focus();
  },
  'e-loeschen'(btn) {
    entwurf.getraenke.splice(entwurfZeile(btn), 1);
    renderEinstellungen();
  },
  'e-hoch': (btn) => verschiebe(entwurfZeile(btn), -1),
  'e-runter': (btn) => verschiebe(entwurfZeile(btn), 1),
  'e-pfand-standard'(btn) {
    entwurf.pfandStandardAn = btn.dataset.wert === '1';
    renderEinstellungen();
  },
  'e-speichern': entwurfSpeichern,
  'e-verwerfen'() {
    entwurf = entwurfAus(S.config);
    renderEinstellungen();
  },
  sperren() {
    entsperrt = false;
    entwurf = null;
    renderEinstellungen();
  },
  update() {
    updateAngefordert = true;
    if (neuerWorker) neuerWorker.postMessage('skipWaiting');
    else location.reload();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action], [data-ansicht]');
  if (!el || el.disabled) return;
  if (el.dataset.ansicht) return zeige(el.dataset.ansicht);
  AKTIONEN[el.dataset.action]?.(el, e);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const art = form.dataset.form;
  if (art === 'import') importiere(form.elements.code.value);
  else if (art === 'pin') entsperren(form);
  else if (art === 'pin-neu') pinAendern(form);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'gegeben-eingabe') {
    gegebenCent = K.parseEuro(t.value);
    zeigeRueckgeld();
  } else if (t.id === 'name-eingabe') {
    S.name = t.value.trim();
    speichern('name', S.name);
  } else if (t.dataset.feld && entwurf) {
    if (t.dataset.feld === 'pfandbetrag') {
      entwurf.pfand = t.value;
      return;
    }
    const g = entwurf.getraenke[entwurfZeile(t)];
    if (!g) return;
    if (t.dataset.feld === 'pfand') g.pfand = t.checked;
    else g[t.dataset.feld] = t.value;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'mit-eigenem') {
    S.mitEigenem = e.target.checked;
    speichern('mitEigenem', S.mitEigenem);
    renderGesamt();
  }
});

window.addEventListener('hashchange', pruefeLink);

// ---------- Offline / Updates ----------

let neuerWorker = null;
let updateAngefordert = false;

function zeigeUpdate(worker) {
  neuerWorker = worker;
  $('#update-hinweis').hidden = false;
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) zeigeUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) zeigeUpdate(w);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateAngefordert) location.reload();
  });
}

// ---------- Start ----------

zeige('kasse');
pruefeLink();
