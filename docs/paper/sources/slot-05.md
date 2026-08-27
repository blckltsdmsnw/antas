# Slot 5 — PAGASA warning products and their spatial granularity
Status: FOUND

## Recommended source
APA: Philippine Atmospheric, Geophysical and Astronomical Services Administration. (n.d.). *Flood information*. Retrieved August 15, 2026, from https://www.pagasa.dost.gov.ph/flood
URL fetched: https://www.pagasa.dost.gov.ph/flood
Official PAGASA domain: yes

## Supporting quote

From the live basin status table on the page (the operational index of every flood product PAGASA issues), the spatial unit is the river basin — eighteen of them for the whole country, with Metro Manila's flooding covered by a single entry:

> 18 MAJOR RIVER BASINS — STATUS
> Pampanga — Flood Watch
> Agno — Non-Flood Watch
> Bicol — Non-Flood Watch
> Cagayan — Non-Flood Watch
> NCR/Pasig Marikina Laguna de Bay — Non-Flood Watch
> Abra — Non-Flood Watch
> [...]

And on the taxonomy of the bulletins themselves, whose assessment thresholds are defined against river discharge and a "flood warning zone," never a street:

> The Warning/Information on flood are divided into two n(2) groups, namely; Flood Bulletin and Flood Information.
>
> Flood Bulletin is categorized into four (4) kinds of warning namely: Flood Outlook, Flood Advisory, Flood Warning and Critical Flood Warning. The PAGASA prepares and issues the corresponding Flood Bulletins at the exact time.
>
> In the issuance of Flood Bulletins PAGASA uses three (3) assessment levels as guides, namely:
>
> ALERT W.L. - corresponds to such river discharge which will not cause flooding in the flood warning zone.
>
> ALARM W.L. - corresponds to such river discharge which will not cause substantial flooding in the cultivated land and residential areas.
>
> CRITICAL W.L. - corresponds to such river discharge that causes extensive flooding in cultivated land and residential areas.

And on dissemination, which stops at the municipal tier:

> Dissemination of discharge warnings of flood warnings /information to the local, municipal, and provincial government offices, disaster coordinating councils and the general public through the FFWS Center, FFWS Dam Offices, OCD, DPWH, NWRB and other government agencies as well as the print and broadcast media.

## How it supports the paper

This is PAGASA's own operational page, and its structure is the argument: the agency's flood picture for the entire country resolves to eighteen rows, one per major river basin, and everything from Rodriguez to Manila collapses into the single row "NCR/Pasig Marikina Laguna de Bay." The four bulletin grades (Flood Outlook, Flood Advisory, Flood Warning, Critical Flood Warning) are triggered by *river discharge* crossing Alert, Alarm, and Critical water levels — a measurement taken at a gauging station on a river and applied to a whole "flood warning zone," not to any particular address within it. Dissemination likewise terminates at "local, municipal, and provincial government offices." A resident therefore learns that their basin is in a Flood Watch and that discharge has passed Alarm level, which is precisely the authoritative-at-basin-scale, silent-at-doorstep-scale gap the problem statement describes. Antas fills the missing tier below the basin.

## Alternates considered

All three were fetched and resolve on PAGASA's own domain; any could substitute or be cited alongside the primary.

1. **The live Marikina-basin bulletin itself** — https://www.pagasa.dost.gov.ph/flood/ncr-pasig-marikina-laguna-de-bay (retrieved August 15, 2026). This is the actual product a Marikina resident would read, and every noun in it is the basin:
   > NCR/Pasig Marikina Laguna de Bay River Basin
   > ISSUED AT 9:00 AM, 15 AUGUST 2026
   > VALID UNTIL 9:00 AM TOMORROW
   > OBSERVED 24-HR RAINFALL: LIGHT RAINS WERE RECORDED OVER THE BASIN DURING THE PAST 24 HOURS.
   > FORECAST 24-HR RAINFALL: SCATTERED LIGHT RAINS AND THUNDERSTORMS.
   > FORECAST WATER LEVEL: WATER LEVELS WITHIN THE BASIN ARE EXPECTED TO REMAIN NORMAL DURING THE FORECAST PERIOD.

   This is arguably the sharpest single quote for the paper, because "over the basin" and "within the basin" are the only spatial qualifiers the entire bulletin contains. It carries a hard 2026 date, which satisfies the date restriction without needing a retrieval date. Consider citing this *with* the primary: the hub page proves the system is organised by basin, this page proves the individual product is too.

2. **PAGASA NCR-PRSD regional forecast page** — https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd (retrieved August 15, 2026). Best evidence for the *rainfall/thunderstorm* side of the argument, where the unit is the province and, at finest, the city or municipality:
   > As of today, there is no Heavy Rainfall Warning Issued.
   >
   > Thunderstorm is MORE LIKELY to develop over Greater Metro Manila Area(Metro Manila, Bulacan, Rizal, Laguna and Cavite) within 12 hours.
   >
   > Moderate to heavy rainshowers with lightning and strong winds are expected over Bataan(Orani, Samal, Abucay, Balanga, Pilar, Morong, Bagac), Batangas(Nasugbu, Calatagan, Lian) and Cavite(Ternate, Naic, Tanza, Rosario, Cavite City, Noveleta) within the next 2 hours.
   >
   > The above conditions are being experienced in Bulacan(San Jose del Monte, Norzagaray), Rizal(Rodriguez), Metro Manila(Quezon City, San Juan, Pasig, Mandaluyong, Marikina, Manila, Makati), Quezon(General Nakar) and Zambales(Botolan) which may persist within 2 hours and may affect nearby areas.

   Note the finest granularity PAGASA reaches anywhere in its public products: "Metro Manila(Quezon City, ... Marikina, Manila, Makati)" — the whole city of Marikina as one unit. That is the strongest possible version of the paper's point, made in PAGASA's own words.

3. **PAGASA legend / warning-icon reference** — https://www.pagasa.dost.gov.ph/learnings/legend (retrieved August 15, 2026). The published definition of the colour-coded rainfall warning levels:
   > Rainfall Warning Icons — Icon | Description | Forecast | Action / Response
   > Heavy Rainfall — Rain Measurement is 7.5-15mm Observed in 1hour and expected to continue in the next 2 hours — Equivalent to: 2 gallons per square meter / hour — Flood is possible — Monitor the weather condition
   > Intense Rainfall — Rain Measurement is 15-30mm Observed in 1hour and expected to continue in the next 2 hours — Equivalent to: 4 to 8 gallons per square meter / hour
   >
   > Advisory — Community AWARENESS — Flooding is POSSIBLE in low-lying areas and near river channels.
   > Alert — Community PREPAREDNESS — Flooding is THREATHENING in low-lying areas and near river channels.
   > Emergency — Community RESPONSE — SEVERE Flooding is EXPECTED. Take necessary precautionary measures.

   Useful for a secondary sub-point: even the *impact* language is spatially generic — "low-lying areas and near river channels" — which tells a resident a category of place, not their place. (The "THREATHENING" misspelling is PAGASA's own; keep it and mark it [sic] if quoted.)

**Rejected:** the General Flood Advisory page (https://www.pagasa.dost.gov.ph/flood/general-flood-advisory) returns HTTP 200 but its advisory body renders empty on server fetch — the content loads client-side. Do not cite it; nothing verbatim could be extracted. News coverage (Manila Bulletin, Inquirer) describing PAGASA basin advisories was found but not used, per the brief's preference for the primary domain.

## Caveats

- **Site reachability:** pagasa.dost.gov.ph was fully reachable on this attempt. All four URLs above returned HTTP 200 and were downloaded and parsed directly, not read from cache or memory.
- **Undated hub page:** the recommended primary (/flood) carries no publication or copyright date, so APA requires a retrieval date — hence "Retrieved August 15, 2026, from". This is expected and correct for a continuously updated government web page, and is exactly the case APA's retrieval-date rule exists for.
- **Live content:** the basin status table, the NCR bulletin, and the NCR-PRSD advisories are all live and will change. The quoted values (Pampanga in Flood Watch, NCR basin Non-Flood Watch, the 15 August 2026 bulletin, the 10:00 PM thunderstorm watch) are the state as retrieved. If the paper quotes the transient values, timestamp them in-text; if it quotes only the *structure* (eighteen basins, four bulletin grades, three water-level thresholds), that is stable and no timestamping is needed. **Recommendation: quote the structure, not the readings** — the argument does not depend on what today's water level is.
- **Archival:** because the content is live, consider capturing a Wayback snapshot of /flood and of the NCR basin bulletin so a marker checking months from now sees what you saw.
- **Title:** every page on the site emits the same generic `<title>PAGASA</title>`; the title used in the APA line ("Flood information") is taken from the page's visible heading and breadcrumb, which is the correct APA practice.
- **Transcription:** quotes are reproduced exactly as rendered, including PAGASA's own typos ("two n(2) groups", "THREATHENING", missing spaces before parentheses in the NCR advisories). Mark with [sic] if that matters to the paper's style guide.
