// model.js — calculation logic.
// All fixed-schedule data (rente, aflossing, fiscaal voordeel) is NOT adjustable
// — only the assumption parameters below are exposed as sliders.

const SCHEDULE = {
  RENTE: {1:10093,2:19927,3:19569,4:19196,5:18808,6:18402,7:17979,8:17538,9:17077,10:16597,
    11:16097,12:15574,13:15030,14:14461,15:13869,16:13251,17:12606,18:11934,19:11232,20:10501,
    21:9738,22:8942,23:8112,24:7246,25:6343,26:5401,27:4418,28:3394,29:2325,30:1210,31:172},
  AFLOSSING: {1:4025,2:8308,3:8665,4:9038,5:9427,6:9833,7:10256,8:10697,9:11157,10:11637,
    11:12138,12:12660,13:13205,14:13773,15:14366,16:14984,17:15629,18:16301,19:17002,20:17734,
    21:18497,22:19293,23:20123,24:20989,25:21892,26:22834,27:23816,28:24841,29:25910,30:27024,31:13945},
  FISCAAL: {1:4170,2:8224,3:8067,4:7902,5:7731,6:7553,7:7367,8:7173,9:6972,10:6760,
    11:6540,12:6311,13:6071,14:5821,15:5560,16:5289,17:5006,18:4711,19:4403,20:4081,
    21:3745,22:3396,23:3031,24:2651,25:2253,26:1840,27:1408,28:957,29:487,30:0,31:0},
};

// Fixed constants from the notebook (not exposed as sliders).
const FIXED = {
  KOOPSOM: 480000.0,
  WOZ_START: 480000.0,
  OZB_TARIEF: 0.000643,
  AANKOOPKOSTEN_NU: 6552.0,
  OVERDRACHTSBEL_NU: 0.0,
  NIEUWE_FIN_KOSTEN: 6552.0, // = AANKOOPKOSTEN_NU in notebook
};

// Adjustable assumptions — these are the slider defaults (baseline scenario).
const DEFAULTS = {
  HUUR_NU: 1857.0,
  HUUR_STIJGING: 0.04,
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
  OVERBIEDEN: 0,
  HORIZON_JAREN: 5,
};

const TOOLTIPS = {
  HUUR_NU:            "De huidige kale maandhuur, exclusief gas/water/licht.\n\nGebruik:\njaarhuur(j) = HUUR_NU × 12\n             × (1 + HUUR_STIJGING)^(j−1)",
  HUUR_STIJGING:      "Jaarlijkse procentuele huurverhoging. Huur groeit elk jaar exponentieel.\n\nGebruik:\njaarhuur(j) = HUUR_NU × 12\n             × (1 + HUUR_STIJGING)^(j−1)",
  VVE_PER_MND:        "Maandelijkse bijdrage aan de Vereniging van Eigenaren. Dekt gezamenlijk onderhoud van het gebouw. Stijgt jaarlijks met HEFFING_STIJGING.\n\nGebruik:\nvve_jaar(j) = VVE_PER_MND\n             × (1 + HEFFING_STIJGING)^(j−1) × 12",
  RIOOL_PER_MND:      "Maandelijks aandeel van de gemeentelijke rioolheffing. Stijgt jaarlijks met HEFFING_STIJGING.\n\nGebruik:\nriool_jaar(j) = RIOOL_PER_MND\n               × (1 + HEFFING_STIJGING)^(j−1) × 12",
  ORV_PER_MND:        "Overlijdensrisicoverzekering — vaak verplicht bij hypotheek. Stijgt met HEFFING_STIJGING.\n\nGebruik:\norv_jaar(j) = ORV_PER_MND\n             × (1 + HEFFING_STIJGING)^(j−1) × 12",
  WOZ_STIJGING:       "Jaarlijkse stijging van de WOZ-waarde. Drijft de OZB-belasting op omdat OZB als percentage van de WOZ wordt berekend.\n\nGebruik:\nwoz(j) = WOZ_START × (1 + WOZ_STIJGING)^(j−1)\nozb(j) = woz(j) × OZB_TARIEF",
  HEFFING_STIJGING:   "Jaarlijkse stijging van VvE, riool en ORV samen (inflatie-achtig).\n\nGebruik:\nheffing(j) = heffing(1)\n            × (1 + HEFFING_STIJGING)^(j−1)",
  WAARDESTIJGING:     "Jaarlijkse procentuele stijging van de marktwaarde van de woning. Bij 0% groeit de waarde niet. Heeft ook effect op de OZB via WOZ_STIJGING.\n\nGebruik:\nwaarde(j) = (KOOPSOM + OVERBIEDEN)\n           × (1 + WAARDESTIJGING)^j",
  MAKELAAR_PCT:       "Courtage die de verkoopmakelaar rekent over de verkoopprijs bij verkoop.\n\nGebruik:\nverkoopkosten = waarde(j) × MAKELAAR_PCT",
  OVERBIEDEN:         "Als de woning onder de marktwaarde gekocht wordt, is dit het verschil (marktwaarde − koopsom). Dit levert direct extra vermogen op bij verkoop, en groeit mee met WAARDESTIJGING.\n\nGebruik:\nstartwaarde = KOOPSOM + OVERBIEDEN\nwaarde(j)   = startwaarde × (1 + WAARDESTIJGING)^j",
  OVERSTAP_MEEREKENEN:"Aan/uit: rekent de eenmalige kosten van het kopen van een volgend huis mee (overdrachtsbelasting + financieringskosten). Zet uit om alleen dit huis te beoordelen.\n\nGebruik:\nals AAN: overstap = TWEEDE_HUIS_PRIJS\n                    × OVERDRACHTSBEL_PCT\n                  + NIEUWE_FIN_KOSTEN",
  TWEEDE_HUIS_PRIJS:  "Geschatte koopsom van het volgende huis na verkoop van dit huis. Bepaalt de hoogte van de overdrachtsbelasting bij de overstap.\n\nGebruik:\noverdracht = TWEEDE_HUIS_PRIJS\n            × OVERDRACHTSBEL_PCT",
  OVERDRACHTSBEL_PCT: "Overdrachtsbelasting bij aankoop van een volgend (niet-eerste) huis. Startersvrijstelling geldt éénmalig — bij het tweede huis betaal je dit tarief.\n\nGebruik:\nbelasting = TWEEDE_HUIS_PRIJS\n           × OVERDRACHTSBEL_PCT",
  HORIZON_JAREN:      "Aantal jaren dat de doorrekening loopt. De grafiek en tabel tonen precies dit aantal jaar.",
};

const LABELS = {
  HUUR_NU: "Huidige kale huur / maand",
  HUUR_STIJGING: "Jaarlijkse huurverhoging",
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
  OVERBIEDEN: "Overbieden (marktwaarde − koopsom)",
  HORIZON_JAREN: "Horizon",
};

function huurKostenCumulatief(p, jaren) {
  const cum = []; let totaal = 0;
  for (let j = 1; j <= jaren; j++) {
    totaal += p.HUUR_NU * 12 * Math.pow(1 + p.HUUR_STIJGING, j - 1);
    cum.push(totaal);
  }
  return cum;
}

function heffingenJaar(p, j) {
  const woz = FIXED.WOZ_START * Math.pow(1 + p.WOZ_STIJGING, j - 1);
  const ozb = woz * FIXED.OZB_TARIEF;
  const overigeMnd = (p.RIOOL_PER_MND + p.VVE_PER_MND + p.ORV_PER_MND) * Math.pow(1 + p.HEFFING_STIJGING, j - 1);
  return ozb + overigeMnd * 12;
}

function koopKostenCumulatief(p, jaren) {
  const cum = []; let totaal = FIXED.AANKOOPKOSTEN_NU + FIXED.OVERDRACHTSBEL_NU;
  for (let j = 1; j <= jaren; j++) {
    const rente = SCHEDULE.RENTE[j] || 0;
    const fiscaal = SCHEDULE.FISCAAL[j] || 0;
    totaal += rente + heffingenJaar(p, j) - fiscaal;
    cum.push(totaal);
  }
  return cum;
}

function overstapkosten(p, woningwaarde) {
  if (!p.OVERSTAP_MEEREKENEN) return 0;
  const prijs2e = (p.TWEEDE_HUIS_PRIJS != null) ? p.TWEEDE_HUIS_PRIJS : woningwaarde;
  return prijs2e * p.OVERDRACHTSBEL_PCT + FIXED.NIEUWE_FIN_KOSTEN;
}

function opgebouwdVermogen(p, jaren) {
  const cum = []; let afgelost = 0;
  const marktwaarde_start = FIXED.KOOPSOM + (p.OVERBIEDEN || 0);
  for (let j = 1; j <= jaren; j++) {
    afgelost += SCHEDULE.AFLOSSING[j] || 0;
    const woningwaarde = marktwaarde_start * Math.pow(1 + p.WAARDESTIJGING, j);
    const waardestijging = woningwaarde - FIXED.KOOPSOM;
    const verkoopkosten = woningwaarde * p.MAKELAAR_PCT;
    cum.push(afgelost + waardestijging - verkoopkosten - overstapkosten(p, woningwaarde));
  }
  return cum;
}

function compute(p) {
  const n = p.HORIZON_JAREN;
  const jaren = Array.from({length: n}, (_, i) => i + 1);
  const huurCum = huurKostenCumulatief(p, n);
  const koopCum = koopKostenCumulatief(p, n);
  const vermogen = opgebouwdVermogen(p, n);
  const koopNetto = koopCum.map((v, i) => v - vermogen[i]);
  const verschil = huurCum.map((v, i) => v - koopNetto[i]);

  let breakEven = null;
  for (let i = 0; i < verschil.length - 1; i++) {
    if (verschil[i] < 0 && verschil[i + 1] >= 0) { breakEven = jaren[i + 1]; break; }
  }
  return { jaren, huurCum, koopCum, koopNetto, verschil, breakEven };
}
