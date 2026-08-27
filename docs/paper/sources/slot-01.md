# Slot 1 — Crowdsourced and Participatory Disaster Reporting
Status: FOUND

## Recommended source
APA: Esparza, M., Farahmand, H., Liu, X., & Mostafav, A. (2024). Enhancing inundation monitoring of road networks using crowdsourced flood reports. *Urban Informatics, 3*(1), Article 25. https://doi.org/10.1007/s44212-024-00055-7
Year: 2024
DOI/URL fetched: https://doi.org/10.1007/s44212-024-00055-7 (resolved to https://link.springer.com/article/10.1007/s44212-024-00055-7, HTTP 200, full text retrieved; Crossref metadata confirmed at https://api.crossref.org/works/10.1007/s44212-024-00055-7)
Venue: Urban Informatics (Springer)
Peer reviewed: yes — Original Article, open access (CC BY 4.0)

## Supporting quote

On the core gauge-versus-street claim (abstract):

> The results indicate that 3-1-1 reports effectively improve flood monitoring by reducing the need for physical sensors by 32% in areas that lack flood sensors. This approach can help city managers improve flood monitoring by leveraging socially sensed data to supplement physical sensors, especially in blind spots where no flood gauge exists.

On why instrument networks cannot cover a city (Introduction):

> First, physical sensors are not installed extensively and systematically, and therefore, the network of sensors may not be able to provide sufficient information needed to monitor the flooding status of entire region or infrastructure networks (Li et al., 2018). This limitation leaves multiple areas as blind spots for inundation monitoring.

On report volume (Section 3, data):

> The 3-1-1 reports were filtered to only focus on flooding. From the Table 1 and Fig. 4, Hurricane Harvey and the Tax-day Flood had the largest number of reports, 597 and 545 respectively, while the Imelda Storm had 84 reports.

On reliability of resident reports as a signal (Conclusion):

> This shows that clusters of 3-1-1 reports can provide reliable flood signals to supplement flood sensing. In addition, employing a graph-based observability analysis shows that existing physical sensors are not sufficient for monitoring entire road network in the study area, and thus, more physical flood sensors are needed. Nevertheless, 3-1-1 reports can decrease reliance to additional sensors by 32% in this case study.

## How it supports the paper
This is the empirical warrant for Antas's premise stated almost in the project's own terms: the authors show that resident-submitted flood reports carry a reliable enough signal to substitute for instrumentation "in blind spots where no flood gauge exists," quantifying the substitution at a 32% reduction in required physical sensors across two watersheds in Harris County, Texas. It establishes viability at city scale with concrete report volumes per event (597, 545, and 84 reports for three separate floods) and treats geographic coverage explicitly through a graph-based observability analysis that asks which road-network nodes a sensor network fails to observe and where resident reports can stand in. Critically for Antas, the paper's finding is not that residents replicate gauges but that they observe a different thing in a different place — the inundated street rather than the channel stage — which is precisely the ankle/knee/waist distinction Antas is built to capture.

On the free-form contrast the brief asks for: the 3-1-1 stream is unstructured municipal service-request text, and the authors had to filter it down to flooding before use, then treat surviving reports only as presence-of-flooding signals clustered near a node. No depth value exists in the reports at all — the study derives flood state by correlating report density against gauge water elevation. Antas's fixed five-level body-part scale is the direct trade the brief describes: narrower intake and less reach than an open 3-1-1 channel, but every submission arrives already comparable across reporters and locations, with no filtering or inference step between the report and the depth reading.

## Alternates considered

- **Chow, T. E., Chien, J., & Meitzen, K. (2023). Validating the quality of volunteered geographic information (VGI) for flood modeling of Hurricane Harvey in Houston, Texas. *Hydrology, 10*(5), 113. https://doi.org/10.3390/hydrology10050113** — 2023, gold OA, and I did fetch and read the full PDF (via https://res.mdpi.com/d_attachment/hydrology/hydrology-10-00113/article_deploy/hydrology-10-00113.pdf; the mdpi.com HTML page 403s). Genuinely strong and arguably the closest structural analogue to Antas: the U-Flood platform crowdsourced *flooded street segments* across the Houston metro area, yielding 399–479 data points per day over 31 Aug–6 Sep 2017 and 472 street segments total, validated against a HEC-RAS model with 85.9% of segments within 1 m water-depth difference. Not chosen as primary only because its contribution is data-quality validation against a hydraulic model rather than the coverage/instrument-substitution argument Antas needs, and because U-Flood volunteers marked segments as flooded without reporting depth (depth was reconstructed by the researchers from a lidar DEM), which makes the reporting-scale contrast less direct. **Worth citing alongside the primary** if the author wants a second, street-segment-level precedent.
- Waze VGI flash-flood paper — Scientific Reports (2022), https://doi.org/10.1038/s41598-022-08751-7, gold OA, fetched. Rejected: reports are driver-generated traffic hazard pings during Hurricane Harvey used to infer unreported flash-flood events, not resident depth observations, and the framing is hazard-record completion rather than city-scale reporting viability.
- Participatory flood risk mapping in Dharavi — *International Journal of Disaster Risk Science* (2022), https://doi.org/10.1007/s13753-022-00406-5. Rejected on fit: it is a critique of participation quality in a workshop-based mapping exercise, not a platform handling report volume.

**Note on PetaBencana.id:** the brief asked specifically for recent work on this platform, and I could not find a peer-reviewed 2022+ study of it. An OpenAlex title-and-abstract search for "PetaBencana" filtered to 2022-01-01 onward returns exactly one record, and it is a book index entry, not a study. What exists is either pre-window (the PetaJakarta.org lineage), non-indexed Indonesian-language public-administration journals such as *JKAP* (a collaborative-governance qualitative study, not a report-volume analysis), or platform self-published impact figures on info.petabencana.id and its blog — none of which meet the bar here. The platform's own API docs (docs.petabencana.id) are a legitimate primary artifact if the author wants to describe PetaBencana's design in the related-work narrative, but they are documentation, not a citable finding.

## Unverified leads
The author has university library access and may wish to chase these. **None of these were fetched — DOIs are transcribed from OpenAlex/Crossref index records, not confirmed against retrieved full text.** Verify before citing.

| Source | Year | Venue | DOI | Why flagged |
|---|---|---|---|---|
| Unpacking the role of volunteered geographic information in disaster management: focus on data quality | 2024 | Geomatics, Natural Hazards and Risk | 10.1080/19475705.2023.2300825 | Recent review of VGI data quality in disaster management; would strengthen the reliability argument. Taylor & Francis returned 403 to both WebFetch and curl. |
| The utility of using Volunteered Geographic Information (VGI) for evaluating pluvial flood models | 2023 | Science of the Total Environment | 10.1016/j.scitotenv.2023.164962 | Directly on whether citizen reports suffice to validate urban pluvial flood models. ScienceDirect returned 403. |
| Examining data imbalance in crowdsourced reports for improving flash flood situational awareness | 2023 | International Journal of Disaster Risk Reduction | 10.1016/j.ijdrr.2023.103825 | Squarely on report-volume skew and geographic coverage gaps — likely the single best complement to the primary. Closed access; a green preprint exists at arXiv:2207.05797 (2022) which should be checkable. |
| Urban flood risk management through the lens of citizen science: A case study on two city centres | 2025 | International Journal of Disaster Risk Reduction | 10.1016/j.ijdrr.2025.105405 | Citizen-science flood reporting at city-centre scale; in-window and in a named target venue. Hybrid/closed. |
| Analysis of Mumbai floods in recent years with crowdsourced data | 2024 | Urban Climate | 10.1016/j.uclim.2024.101815 | Global-South megacity crowdsourced flood reporting — geographically closer to Metro Manila than the Houston cases. Closed access; green preprint at arXiv:2306.09770. |
| Achieving fine-grained urban flood perception and spatio-temporal evolution analysis based on social media | 2023 | Sustainable Cities and Society | 10.1016/j.scs.2023.105077 | Fine-grained urban flood perception from crowd data. Closed access. |
| Mobile and web-based application as a tool for flood data collection based on citizen science | 2024/2025 | Earth Science Informatics | 10.1007/s12145-024-01664-1 | Describes building a citizen-science flood data collection app — closest to Antas as a *system* paper. Closed access. |

## Caveats
- **Author name.** Crossref records the fourth author's family name as **"Mostafav"** (not "Mostafavi"), and the Springer page renders it the same way. This is near-certainly Ali Mostafavi of the Urban Resilience.AI Lab at Texas A&M, whose lab is credited in the acknowledgements — the published record appears to contain a typo. I have cited it **as published**. If the author's citation manager auto-corrects to "Mostafavi," that is defensible, but the DOI record says otherwise; do not let a checker's DOI lookup produce a mismatch without explanation.
- **Geographic transfer.** The study is Harris County, Texas — a US context with an existing municipal 3-1-1 service line and a dense USGS/HCFCD gauge network. Metro Manila has neither in the same form, so the finding transfers as *directional* support (residents cover what instruments miss) rather than as a calibrated estimate. Do not import the 32% figure as if it predicts anything about Manila.
- **Reporting channel is not a purpose-built app.** 3-1-1 is a general municipal complaint line, not a flood-reporting platform. This is what makes the free-form contrast so usable, but it also means the paper is not evidence about voluntary adoption of a dedicated flood app — it observes a channel residents already had a reason to use. If the paper needs adoption evidence specifically, that is a different citation, and the Chow/U-Flood alternate is closer.
- **Event scale, not continuous operation.** Report counts are per discrete flood event (597 / 545 / 84), spanning 4–6 days each, in 2016–2019. The paper says nothing about sustained day-to-day reporting or about report freshness/decay — so it does not support Antas's six-hour staleness rule. That design decision needs its own warrant from another slot.
- **No paywall.** Primary source is CC BY 4.0 diamond open access. The author can read, quote, and redistribute it freely.
