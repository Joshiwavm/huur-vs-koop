// model.js — calculation logic.
// Het hypotheekschema (rente, aflossing) wordt berekend met de standaard
// annuïteitenformule uit (koopsom, rente, looptijd). Het fiscaal voordeel volgt
// uit een lineair model dat op beide V&W-doorrekeningen (470k & 480k) past:
//   fiscaal(jaar) = (rente(jaar) − EWF) × AFTREK_TARIEF

const VAST = {
  LOOPTIJD: 30,                 // looptijd hypotheek in jaren (vast)
  OZB_TARIEF: 0.000643,         // OZB-tarief Rotterdam 2026 (0,0643% van WOZ)
  EWF_JAAR: 1215,               // eigenwoningforfait per jaar (uit doorrekening)
  AFTREK_TARIEF: 0.4395,        // gehanteerd aftrektarief (uit doorrekening)
  NHG_GRENS: 470000,            // onder dit bedrag: NHG van toepassing
  NHG_RENTE: 0.0389,            // rente met NHG (uit 470k-doorrekening)
  NHG_KOSTEN: 1880,             // eenmalige NHG-kosten
  STARTERS_GRENS: 555000,       // boven dit bedrag vervalt de startersvrijstelling
  OVERDRACHTSBELASTING: 0.02,   // overdrachtsbelasting (2%) boven de startersgrens
  NIEUWE_FIN_KOSTEN: 6552,      // financieringskosten bij aankoop tweede huis
};

// Adjustable assumptions — slider defaults (baseline scenario).
const DEFAULTS = {
  HUUR_NU: 1857.0,
  HUUR_STIJGING: 0.04,
  KOOPSOM: 480000,
  RENTE: 0.0422,
  AANKOOPKOSTEN_NU: 6552,
  EXTRA_KOSTEN_KOPER: 0,
  OVERBIEDEN: 0,
  VVE_PER_MND: 200.0,
  RIOOL_PER_MND: 27.0,
  ORV_PER_MND: 15.0,
  WOZ_STIJGING: 0.04,
  HEFFING_STIJGING: 0.03,
  WAARDESTIJGING: 0.00,
  MAKELAAR_PCT: 0.0125,
  OVERSTAP_MEEREKENEN: true,
  TWEEDE_HUIS_PRIJS: 600000,
  OVERDRACHTSBEL_PCT: 0.02,
  HORIZON_JAREN: 5,
};

const TOOLTIPS = {
  HUUR_NU:            "De huidige kale maandhuur, exclusief gas/water/licht.",
  HUUR_STIJGING:      "Jaarlijkse procentuele huurverhoging. Huur groeit elk jaar exponentieel.",
  KOOPSOM:            "De koopprijs van de woning. Je financiert 100% met hypotheek, dus dit is ook het hypotheekbedrag. Onder € 470.000 geldt NHG (lagere rente + eenmalige NHG-kosten); boven € 555.000 vervalt de startersvrijstelling en betaal je 2% overdrachtsbelasting.",
  RENTE:              "Hypotheekrente (annuïteit, 30 jaar). Rente en aflossing per jaar worden hieruit berekend. Onder de NHG-grens van € 470.000 wordt automatisch 3,89% gebruikt.",
  AANKOOPKOSTEN_NU:   "Eenmalige kosten bij aankoop: notariskosten, taxatie, hypotheekadvies etc. (kosten koper).",
  EXTRA_KOSTEN_KOPER: "Aanvullende eenmalige kosten, bijv. bouwtechnische keuring of aankoopmakelaar.",
  OVERBIEDEN:         "Als de woning onder de marktwaarde gekocht wordt, is dit het verschil (marktwaarde − koopsom). Dit levert direct extra vermogen op bij verkoop en groeit mee met de waardestijging.",
  VVE_PER_MND:        "Maandelijkse bijdrage aan de Vereniging van Eigenaren. Dekt gezamenlijk onderhoud van het gebouw. Stijgt jaarlijks met de heffingenstijging.",
  RIOOL_PER_MND:      "Maandelijks aandeel van de gemeentelijke rioolheffing. Stijgt jaarlijks met de heffingenstijging.",
  ORV_PER_MND:        "Overlijdensrisicoverzekering — vaak verplicht bij hypotheek. Stijgt jaarlijks met de heffingenstijging.",
  WOZ_STIJGING:       "Jaarlijkse stijging van de WOZ-waarde. Drijft de OZB-belasting op, omdat OZB als percentage van de WOZ-waarde wordt berekend.",
  HEFFING_STIJGING:   "Jaarlijkse stijging van VvE, riool en ORV samen (inflatie-achtig).",
  WAARDESTIJGING:     "Jaarlijkse procentuele stijging van de marktwaarde van de woning. Bij 0% groeit de waarde niet.",
  MAKELAAR_PCT:       "Courtage die de verkoopmakelaar rekent over de verkoopprijs. Wordt bij elke verkoop van dit huis afgetrokken, los van of je daarna een ander huis koopt.",
  OVERSTAP_MEEREKENEN:"Aan/uit: rekent de eenmalige kosten van het kopen van een volgend huis mee (overdrachtsbelasting + financieringskosten). Zet uit om alleen dit huis te beoordelen.",
  TWEEDE_HUIS_PRIJS:  "Geschatte koopsom van het volgende huis na verkoop van dit huis. Bepaalt de hoogte van de overdrachtsbelasting bij de overstap.",
  OVERDRACHTSBEL_PCT: "Overdrachtsbelasting bij aankoop van een volgend (niet-eerste) huis. De startersvrijstelling geldt éénmalig — bij het tweede huis betaal je dit tarief.",
  HORIZON_JAREN:      "Aantal jaren dat de doorrekening loopt. De grafiek en tabel tonen precies dit aantal jaar.",
};

const LABELS = {
  HUUR_NU: "Huidige kale huur / maand",
  HUUR_STIJGING: "Jaarlijkse huurverhoging",
  KOOPSOM: "Koopsom / hypotheekbedrag",
  RENTE: "Hypotheekrente",
  AANKOOPKOSTEN_NU: "Kosten koper (notaris, taxatie, advies)",
  EXTRA_KOSTEN_KOPER: "Extra kosten koper (bijv. bouwkundige keuring)",
  OVERBIEDEN: "Overbieden (marktwaarde − koopsom)",
  VVE_PER_MND: "VvE / maand",
  RIOOL_PER_MND: "Rioolheffing / maand",
  ORV_PER_MND: "Overlijdensrisicoverz. / maand",
  WOZ_STIJGING: "Jaarlijkse stijging WOZ-waarde",
  HEFFING_STIJGING: "Jaarlijkse stijging heffingen",
  WAARDESTIJGING: "Jaarlijkse waardestijging woning",
  MAKELAAR_PCT: "Makelaarscourtage bij verkoop",
  OVERSTAP_MEEREKENEN: "Overstapkosten meerekenen",
  TWEEDE_HUIS_PRIJS: "Koopsom volgend huis",
  OVERDRACHTSBEL_PCT: "Overdrachtsbelasting 2e huis",
  HORIZON_JAREN: "Horizon",
};

// Effectieve rente: onder de NHG-grens geldt automatisch het NHG-tarief.
function effectieveRente(p) {
  return p.KOOPSOM < VAST.NHG_GRENS ? VAST.NHG_RENTE : p.RENTE;
}

// Annuïteitenschema: rente en aflossing per jaar uit (koopsom, rente, looptijd).
function jaarSchema(p) {
  const P = p.KOOPSOM, i = effectieveRente(p) / 12, n = VAST.LOOPTIJD * 12;
  const M = P * i / (1 - Math.pow(1 + i, -n));
  const rente = {}, aflossing = {};
  let bal = P;
  for (let m = 1; m <= n; m++) {
    const r = bal * i, a = M - r;
    bal -= a;
    const j = Math.floor((m - 1) / 12) + 1;
    rente[j] = (rente[j] || 0) + r;
    aflossing[j] = (aflossing[j] || 0) + a;
  }
  return { rente, aflossing };
}

function fiscaalJaar(renteJaar) {
  return (renteJaar - VAST.EWF_JAAR) * VAST.AFTREK_TARIEF;
}

// Eenmalige koopkosten: kosten koper + extra + (NHG of overdrachtsbelasting).
function eenmaligeKosten(p) {
  let totaal = p.AANKOOPKOSTEN_NU + p.EXTRA_KOSTEN_KOPER;
  if (p.KOOPSOM > VAST.STARTERS_GRENS) totaal += p.KOOPSOM * VAST.OVERDRACHTSBELASTING;
  if (p.KOOPSOM < VAST.NHG_GRENS) totaal += VAST.NHG_KOSTEN;
  return totaal;
}

function huurKostenCumulatief(p, jaren) {
  const cum = []; let totaal = 0;
  for (let j = 1; j <= jaren; j++) {
    totaal += p.HUUR_NU * 12 * Math.pow(1 + p.HUUR_STIJGING, j - 1);
    cum.push(totaal);
  }
  return cum;
}

function heffingenJaar(p, j) {
  const woz = p.KOOPSOM * Math.pow(1 + p.WOZ_STIJGING, j - 1);
  const ozb = woz * VAST.OZB_TARIEF;
  const overigeMnd = (p.RIOOL_PER_MND + p.VVE_PER_MND + p.ORV_PER_MND) * Math.pow(1 + p.HEFFING_STIJGING, j - 1);
  return ozb + overigeMnd * 12;
}

function koopKostenCumulatief(p, jaren, schema) {
  const cum = []; let totaal = eenmaligeKosten(p);
  for (let j = 1; j <= jaren; j++) {
    const rente = schema.rente[j] || 0;
    const fiscaal = fiscaalJaar(rente);
    totaal += rente + heffingenJaar(p, j) - fiscaal;
    cum.push(totaal);
  }
  return cum;
}

function overstapkosten(p, woningwaarde) {
  if (!p.OVERSTAP_MEEREKENEN) return 0;
  const prijs2e = (p.TWEEDE_HUIS_PRIJS != null) ? p.TWEEDE_HUIS_PRIJS : woningwaarde;
  return prijs2e * p.OVERDRACHTSBEL_PCT + VAST.NIEUWE_FIN_KOSTEN;
}

function opgebouwdVermogen(p, jaren, schema) {
  const cum = []; let afgelost = 0;
  const marktwaardeStart = p.KOOPSOM + (p.OVERBIEDEN || 0);
  for (let j = 1; j <= jaren; j++) {
    afgelost += schema.aflossing[j] || 0;
    const woningwaarde = marktwaardeStart * Math.pow(1 + p.WAARDESTIJGING, j);
    const waardestijging = woningwaarde - p.KOOPSOM;
    const verkoopkosten = woningwaarde * p.MAKELAAR_PCT;
    cum.push(afgelost + waardestijging - verkoopkosten - overstapkosten(p, woningwaarde));
  }
  return cum;
}

function compute(p) {
  const n = p.HORIZON_JAREN;
  const jaren = Array.from({length: n}, (_, i) => i + 1);
  const schema = jaarSchema(p);
  const huurCum = huurKostenCumulatief(p, n);
  const koopCum = koopKostenCumulatief(p, n, schema);
  const vermogen = opgebouwdVermogen(p, n, schema);
  const koopNetto = koopCum.map((v, i) => v - vermogen[i]);
  const verschil = huurCum.map((v, i) => v - koopNetto[i]);

  let breakEven = null;
  for (let i = 0; i < verschil.length - 1; i++) {
    if (verschil[i] < 0 && verschil[i + 1] >= 0) { breakEven = jaren[i + 1]; break; }
  }
  return { jaren, huurCum, koopCum, koopNetto, verschil, breakEven };
}
