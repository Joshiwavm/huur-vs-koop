// model.js — calculation logic.
// Het hypotheekschema (rente, aflossing) is verankerd aan de V&W-doorrekening
// (480k @ 4,22%): bij de basiswaarden komt exact die tabel eruit. De annuïteiten-
// formule wordt alleen gebruikt om te SCHALEN als koopsom of rente verschuift:
//   schema(jaar) = ANKER(jaar) × (koopsom/480k) × [annuïteit(rente) / annuïteit(4,22%)]
// Het fiscaal voordeel = (rente − eigenwoningforfait) × aftrektarief, met
// forfait = 0,35% van de WOZ (= koopsom). Aftrektarief 43,95% komt uit de
// doorrekening. Bij de basiswaarden valt dit ~€5/jaar af van de PDF (die de oude
// WOZ van ~350k gebruikte i.p.v. de koopsom).

// Ankertabel uit de doorrekening (480k @ 4,22%). Jaar 1 (2026) is een halfjaar,
// jaar 31 een reststukje — die vorm blijft behouden bij het schalen.
const ANKER = {
  BEDRAG: 480000,
  RENTE: 0.0422,
  RENTE_JAAR: {1:10093,2:19927,3:19569,4:19196,5:18808,6:18402,7:17979,8:17538,9:17077,10:16597,
    11:16097,12:15574,13:15030,14:14461,15:13869,16:13251,17:12606,18:11934,19:11232,20:10501,
    21:9738,22:8942,23:8112,24:7246,25:6343,26:5401,27:4418,28:3394,29:2325,30:1210,31:172},
  AFLOSSING_JAAR: {1:4025,2:8308,3:8665,4:9038,5:9427,6:9833,7:10256,8:10697,9:11157,10:11637,
    11:12138,12:12660,13:13205,14:13773,15:14366,16:14984,17:15629,18:16301,19:17002,20:17734,
    21:18497,22:19293,23:20123,24:20989,25:21892,26:22834,27:23816,28:24841,29:25910,30:27024,31:13945},
};

const VAST = {
  LOOPTIJD: 30,                 // looptijd hypotheek in jaren (vast)
  OZB_TARIEF: 0.000643,         // OZB-tarief Rotterdam 2026 (0,0643% van WOZ)
  FORFAIT_PCT: 0.0035,          // eigenwoningforfait: 0,35% van de WOZ (= koopsom)
  AFTREK_TARIEF: 0.4395,        // gehanteerd aftrektarief (uit doorrekening)
  NHG_GRENS: 470000,            // onder dit bedrag: NHG van toepassing
  NHG_RENTE: 0.0389,            // rente met NHG (uit 470k-doorrekening)
  NHG_KOSTEN: 1880,             // eenmalige NHG-kosten
  STARTERS_GRENS: 555000,       // boven dit bedrag vervalt de startersvrijstelling
  OVERDRACHTSBELASTING: 0.02,   // overdrachtsbelasting (2%) boven de startersgrens
  NIEUWE_FIN_KOSTEN: 6552,      // financieringskosten bij aankoop tweede huis
  BOX3_VRIJ: 118714,            // heffingvrij vermogen 2026 (fiscale partners)
  BOX3_RENDEMENT: 0.0128,       // forfaitair rendement spaargeld 2026
  BOX3_TARIEF: 0.36,            // box 3-tarief 2026
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
  HUUR_NU:            "Huidige kale maandhuur, exclusief gas/water/licht.",
  HUUR_STIJGING:      "Jaarlijkse huurverhoging; de huur groeit elk jaar exponentieel.",
  KOOPSOM:            "Koopprijs = hypotheekbedrag (100% gefinancierd). ≤ €470k: NHG (3,89% + €1.880). > €555k: 2% overdrachtsbelasting.",
  RENTE:              "Hypotheekrente (annuïteit, 30 jaar); bepaalt rente en aflossing per jaar. Bij koopsom ≤ €470k vast op 3,89% (NHG).",
  AANKOOPKOSTEN_NU:   "Eenmalige kosten koper: notaris, taxatie, hypotheekadvies.",
  EXTRA_KOSTEN_KOPER: "Extra eenmalige kosten, bijv. bouwtechnische keuring of aankoopmakelaar.",
  OVERBIEDEN:         "Eigen geld dat je boven de taxatie betaalt. Krijg je bij verkoop terug (geen gratis winst) — alleen de waardegroei erover telt mee.",
  VVE_PER_MND:        "Maandelijkse VvE-bijdrage voor gebouwonderhoud; stijgt met de heffingenstijging. Schatting — check het servicekostenoverzicht.",
  RIOOL_PER_MND:      "Maandelijkse rioolheffing; stijgt met de heffingenstijging.",
  ORV_PER_MND:        "Overlijdensrisicoverzekering (vaak verplicht); stijgt met de heffingenstijging.",
  WOZ_STIJGING:       "Jaarlijkse stijging van de WOZ-waarde. OZB = 0,0643% van de WOZ (Rotterdam 2026).",
  HEFFING_STIJGING:   "Jaarlijkse stijging van VvE, riool en ORV (inflatie-achtig).",
  WAARDESTIJGING:     "Jaarlijkse waardestijging van de woning; 0% = geen groei.",
  MAKELAAR_PCT:       "Makelaarscourtage over de verkoopprijs, bij elke verkoop.",
  OVERSTAP_MEEREKENEN:"Aan: je koopt een volgend huis (overdrachtsbelasting + financieringskosten). Uit: opbrengst op de bank → box 3 over de overwaarde boven €118.714 (samen), tegen 1,28% × 36%.",
  TWEEDE_HUIS_PRIJS:  "Koopsom van het volgende huis; bepaalt de overdrachtsbelasting bij de overstap.",
  OVERDRACHTSBEL_PCT: "Overdrachtsbelasting op het volgende huis (startersvrijstelling geldt eenmalig).",
  HORIZON_JAREN:      "Aantal jaren dat de doorrekening toont in grafiek en tabel.",
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
  return p.KOOPSOM <= VAST.NHG_GRENS ? VAST.NHG_RENTE : p.RENTE;
}

// Annuïteitenschema (30 volle jaren) uit een gegeven rente — alleen gebruikt
// om de verhouding tussen twee rentes te bepalen.
function annuiteit(jaarrente) {
  const i = jaarrente / 12, n = VAST.LOOPTIJD * 12;
  const M = i / (1 - Math.pow(1 + i, -n)); // per euro hoofdsom
  const rente = {}, aflossing = {};
  let bal = 1;
  for (let m = 1; m <= n; m++) {
    const r = bal * i, a = M - r;
    bal -= a;
    const j = Math.floor((m - 1) / 12) + 1;
    rente[j] = (rente[j] || 0) + r;
    aflossing[j] = (aflossing[j] || 0) + a;
  }
  return { rente, aflossing };
}

// Jaar 1 (2026) en jaar 31 zijn halve jaren (aankoop medio 2026).
function jaarFractie(j) {
  return (j === 1 || j === VAST.LOOPTIJD + 1) ? 0.5 : 1;
}

// Schema verankerd aan de doorrekening, geschaald voor koopsom en rente.
// Rente & aflossing schalen elk met hun eigen annuïteitsverhouding. Het fiscaal
// voordeel = (rente − eigenwoningforfait) × aftrektarief, met forfait = 0,35% van
// de WOZ (= koopsom), pro rata voor de halve jaren.
function jaarSchema(p) {
  const fBedrag = p.KOOPSOM / ANKER.BEDRAG;
  const cur = annuiteit(effectieveRente(p));
  const ref = annuiteit(ANKER.RENTE);
  const forfaitVol = VAST.FORFAIT_PCT * p.KOOPSOM;
  const rente = {}, aflossing = {}, fiscaal = {};
  for (let j = 1; j <= VAST.LOOPTIJD + 1; j++) {
    const rRatio = (cur.rente[j] && ref.rente[j]) ? cur.rente[j] / ref.rente[j] : 1;
    const aRatio = (cur.aflossing[j] && ref.aflossing[j]) ? cur.aflossing[j] / ref.aflossing[j] : 1;
    rente[j] = (ANKER.RENTE_JAAR[j] || 0) * fBedrag * rRatio;
    aflossing[j] = (ANKER.AFLOSSING_JAAR[j] || 0) * fBedrag * aRatio;
    fiscaal[j] = (rente[j] - forfaitVol * jaarFractie(j)) * VAST.AFTREK_TARIEF;
  }
  return { rente, aflossing, fiscaal };
}

// Eenmalige koopkosten: kosten koper + extra + (NHG of overdrachtsbelasting).
function eenmaligeKosten(p) {
  let totaal = p.AANKOOPKOSTEN_NU + p.EXTRA_KOSTEN_KOPER;
  if (p.KOOPSOM > VAST.STARTERS_GRENS) totaal += p.KOOPSOM * VAST.OVERDRACHTSBELASTING;
  if (p.KOOPSOM <= VAST.NHG_GRENS) totaal += VAST.NHG_KOSTEN;
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
    const fiscaal = schema.fiscaal[j] || 0;
    totaal += rente + heffingenJaar(p, j) - fiscaal;
    cum.push(totaal);
  }
  return cum;
}

function overstapkosten(p, woningwaarde) {
  const prijs2e = (p.TWEEDE_HUIS_PRIJS != null) ? p.TWEEDE_HUIS_PRIJS : woningwaarde;
  return prijs2e * p.OVERDRACHTSBEL_PCT + VAST.NIEUWE_FIN_KOSTEN;
}

// Box 3 over de overwaarde boven het heffingvrij vermogen (1 jaar).
function box3Belasting(overwaarde) {
  return Math.max(0, overwaarde - VAST.BOX3_VRIJ) * VAST.BOX3_RENDEMENT * VAST.BOX3_TARIEF;
}

function opgebouwdVermogen(p, jaren, schema) {
  const cum = []; let afgelost = 0;
  // Overbieden = eigen inleg boven de taxatie: zit in de woningwaarde en komt bij
  // verkoop terug (vestzak-broekzak), telt dus niet als gratis vermogen — alleen
  // de waardegroei erover telt mee.
  const marktwaardeStart = p.KOOPSOM + (p.OVERBIEDEN || 0);
  for (let j = 1; j <= jaren; j++) {
    afgelost += schema.aflossing[j] || 0;
    const woningwaarde = marktwaardeStart * Math.pow(1 + p.WAARDESTIJGING, j);
    const waardestijging = woningwaarde - marktwaardeStart;
    const verkoopkosten = woningwaarde * p.MAKELAAR_PCT;
    const overwaarde = afgelost + waardestijging - verkoopkosten;
    // Overstap aan: koop volgend huis (overstapkosten). Overstap uit: zet de
    // overwaarde op de bank → box 3-belasting.
    const aftrek = p.OVERSTAP_MEEREKENEN
      ? overstapkosten(p, woningwaarde)
      : box3Belasting(overwaarde);
    cum.push(overwaarde - aftrek);
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
