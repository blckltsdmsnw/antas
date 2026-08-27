# Slot 5 (alternate) — PAGASA legend page: the explicit spatial-unit statement
Status: FOUND

This does not replace the accepted `/flood` source in slot-05.md. It adds a page the
completed agent did not reach, which states the spatial unit of each warning product
in PAGASA's own words rather than leaving it to be inferred from a status table.

## Recommended source
APA: Philippine Atmospheric, Geophysical and Astronomical Services Administration. (n.d.). Legend. Retrieved August 15, 2026, from https://pagasa.dost.gov.ph/learnings/legend
URL fetched: https://pagasa.dost.gov.ph/learnings/legend (HTTP 200, 167,885 bytes, curl with browser UA)
Page title as published: `<title>PAGASA</title>` — the generic site-wide title. The page
carries no on-page heading of its own. In the site navigation it is labelled two ways:
"Legend" (submenu item) and "Rainfall and Thunderstorm Warning System" (anchor link).
Both link to the same `/learnings/legend` URL.
Date shown on page: none shown. No publication or revision date appears anywhere in the
document.

## Supporting quote
The single most direct sentence in the PAGASA corpus for this paper's claim — it names
the spatial unit twice, once as the basin and once as the region:

> A General Flood Advisory is simplified flood bulletin issued for non-telemetered river basins whenever there is a significant amount of rainfall recorded based on past/current observation and the forecast rainfall from the numerical weather prediction models, satellite based information and estimates from radar. It is issued to the public on a regional basis through NDRRMC at 7:00am and 7:00pm

On the telemetered side, the bulletin is issued per basin centre:

> Flood forecast issued by the respective river basin centers like Pampanga, Agno, Bicol, Cagayan and Cagayan De Oro, prepared twice daily during floodwatch. Water level is monitored based on the assessment levels (Alert, Alarm and Critical) which means 40%, 60% and 100% of the river is full respectively.

The colour-coded rainfall warnings resolve no finer than a landform class:

> Advisory / Community AWARENESS / Flooding is POSSIBLE in low-lying areas and near river channels.
> Alert / Community PREPAREDNESS / Flooding is THREATHENING in low-lying areas and near river channels.
> Emergency / Community RESPONSE / SEVERE Flooding is EXPECTED. Take necessary precautionary measures.

(The misspelling "THREATHENING" is in the original.)

The rainfall tiers themselves are defined purely by rate, with the consequence stated as
a landform class rather than a location:

> Torrential Rainfall / Rain Measurement is more than 30mm Obeserved in 1hour and expected to continue in the next 2 hours / Serious flooding expected in low lying areas / Evacuation

(The misspelling "Obeserved" is in the original.)

## How it supports the paper
This page closes the inference gap left by the `/flood` status table. Rather than the
reader deducing basin-level granularity from a list of eighteen basin rows, PAGASA here
states the unit outright: the General Flood Advisory is "issued for non-telemetered river
basins" and reaches the public "on a regional basis." The finest spatial qualifier
attached to any warning tier on the page is "low-lying areas and near river channels" —
a landform class, not an address. The page therefore supplies, in the agency's own
published wording, the exact proposition the problem statement rests on: the warning
resolves to a basin or a region, and the residual question of whether a particular street
corner is ankle-deep or waist-deep is left unanswered by design, not by oversight.

## What is new relative to slot-05.md
1. An explicit agency statement of the issuing unit ("for non-telemetered river basins",
   "on a regional basis"), where the accepted source only implies it structurally.
2. Coverage of the colour-coded rainfall warnings, which the search brief asked for and
   which the accepted `/flood` source does not describe at all.
3. A usable definition of the General Flood Advisory. The completed agent rejected
   `/flood/general-flood-advisory` because that page renders its body client-side — but
   the GFA is *defined* here in server-rendered HTML, so the rejection need not stand as
   a gap in the citation.
4. The dissemination path for the GFA runs "through NDRRMC", which complements the
   "local, municipal and provincial government offices" chain already recorded.

## Alternates considered
- https://www.pagasa.dost.gov.ph/flood — fetched, HTTP 200. Confirms the accepted
  source. Its live timestamp read "August 15,2026 08:00:00 am"; several basin
  descriptions carry older stamps ("As of December 2018", "As of February 2017").
- https://www.pagasa.dost.gov.ph/flood/general-flood-advisory — fetched, HTTP 200,
  133,048 bytes, but the extractable text is navigation chrome only. Confirms the other
  agent's finding independently.
- https://www.pagasa.dost.gov.ph/learning-tools/rainfall-warning — HTTP 404. Does not exist.

## Caveats
- No date of any kind on the legend page, so the APA entry must use `(n.d.)` plus the
  retrieval date. This is the same footing as the accepted source and is APA-compliant
  for an undated government web document.
- The page has no proper title. `<title>` is the site-wide "PAGASA" and there is no on-page
  heading, so any title in the reference list is drawn from the navigation label rather
  than from the document itself. "Legend" is the submenu label and matches the URL slug;
  it is the defensible choice, but it is a weak, non-descriptive title and a marker
  should note it was taken from navigation.
- Content is undated and parts of the surrounding site are visibly old (2014–2018
  stamps), so the legend text may predate 2022 even though it is currently served. The
  date restriction is satisfied by the retrieval date, not by the content's age — worth
  stating plainly if the rubric probes currency.
- The verbatim quotes contain two spelling errors in the original ("THREATHENING",
  "Obeserved"). If quoted in the paper, use [sic] or quote around them.
