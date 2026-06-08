# Huren vs. Kopen — Rotterdam

Interactieve doorrekening van de cumulatieve woonlasten bij **huren** versus **kopen**
van een woning in Rotterdam.

**Live:** https://joshiwavm.github.io/huur-vs-koop/

## Wat het doet

De site rekent live mee terwijl je aan de aannames schuift:

- **Huur cumulatief** — al het huurgeld dat je kwijt bent (stijgt jaarlijks).
- **Koop netto kosten** — rente + heffingen − fiscaal voordeel + eenmalige kosten,
  *minus* de opgebouwde waarde als je zou verkopen en doorverhuizen
  (aflossing + waardestijging − makelaarscourtage − kosten tweede huis).

Aflossing telt bewust **niet** als kosten — dat is vermogensopbouw, geen verloren geld.

## Aanpasbare aannames

Huurhoogte en -stijging · VvE / riool / ORV · WOZ- en heffingenstijging ·
waardestijging woning · makelaarscourtage · overstapkosten naar een tweede huis ·
horizon (1–31 jaar).

De vaste schema's (rente, aflossing en hypotheekrenteaftrek per jaar) staan vast.

## Structuur

| Bestand | Inhoud |
|---|---|
| `index.html` | pagina-opbouw |
| `style.css` | styling |
| `model.js` | rekenlogica |
| `app.js` | sliders, grafiek en tabel |

## Lokaal bekijken

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

> Geen financieel advies. VvE-bedrag is een schatting; OZB-tarief Rotterdam 2026 (0,0643% van WOZ).
