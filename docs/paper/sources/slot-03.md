# Slot 3 — Trust, verification and data quality
Status: FOUND

## Recommended source
APA: Lowrie, C., Kruczkiewicz, A., McClain, S. N., Nielsen, M., & Mason, S. J. (2022). Evaluating the usefulness of VGI from Waze for the reporting of flash floods. *Scientific Reports, 12*(1), 5268. https://doi.org/10.1038/s41598-022-08751-7
Year: 2022
DOI/URL fetched: https://pmc.ncbi.nlm.nih.gov/articles/PMC8960798/ (full text also verified verbatim at https://www.ebi.ac.uk/europepmc/webservices/rest/PMC8960798/fullTextXML; metadata confirmed at https://api.crossref.org/works/10.1038/s41598-022-08751-7)
Venue: Scientific Reports (Nature Portfolio), open access
Peer reviewed: yes

## Supporting quote
> "VGI event clustering relative to authoritative sources is a core component of discerning meaningful information and source credibility"

> "Previous studies have demonstrated the use of data aggregation in conjunction with comparisons to authoritative sources to establish credibility for a source of VGI"

> "Waze users have a credibility score and incentives for accurate reporting, increasing the likelihood that data are more accurate than other platforms."

(All three strings verified character-for-character against the Europe PMC full-text XML, not from a search snippet.)

## How it supports the paper
Lowrie et al. treat an incoming volunteered report as an unverified claim from an unknown contributor and estimate its reliability from three independent directions at once: spatial–temporal clustering of nearby reports (corroboration), comparison against authoritative records such as Local Storm Reports and the Storm Data publication (consistency with independent environmental evidence), and the platform's own standing credibility score for the reporting account (contributor history). That is precisely the logic Antas's six-group trust score generalises — corroborating nearby reports, 24 h rainfall, and relative elevation supply the environmental corroboration side; reporter history, evidence quality, and behavioural signals supply the account side. The paper's central finding, that clustering *relative to authoritative sources* is what discerns credibility, is the direct justification for combining the two families rather than trusting either the reporter's record or the environment alone. It also supports Antas's non-penalisation principle: the authors caution that VGI "is rarely representative of the population", so thin local coverage is a property of the data, not a mark against the person reporting.

## Alternates considered
- Safaei-Moghadam, A., Tarboton, D., & Minsker, B. (2023). *Natural Hazards and Earth System Sciences, 23*(1), 1–19, https://doi.org/10.5194/nhess-23-1-2023. Fetched and verified; excellent on the environmental half — verbatim: "The Waze app has no pre-qualification for users to post a report, consequently not all of the flood-labeled alerts are reliable to be used as flood observations", plus a requirement that "a cluster of more than two flood alerts should be available near the depression", and cross-checks of alert timing against rainfall and of alert location against DEM-derived road surface depressions and the National Flood Hazard Layer. Not chosen as primary only because it has no contributor-history component; it is the strongest second citation if the elevation and rainfall groups need their own support.
- Abbasi, S., Vahdat-Nejad, H., & Moradi, H. (2024). Harnessing trustable crowdsourcing power for flood disaster evaluation. *Natural Hazards, 120*(9), 8723–8741. Closest topical match (user reputation score algorithm + malicious-user detection + information aggregation) but closed access — full text could not be fetched, so it fails the verbatim-quote rule and is not recommended.
- Zeynali Kermani, R. et al. (2022). A method for assessing the credibility of volunteered geographic information in case of flood crisis. *Procedia Computer Science, 207*, https://doi.org/10.1016/j.procs.2022.09.218. Listed as open access, but ScienceDirect returned HTTP 403 on every fetch attempt (landing page and /pdf), and no repository mirror was located, so no verbatim quote could be obtained.

## Caveats
- 2022 is the earliest year the brief permits; this source sits on the boundary. If a strictly later citation is preferred, the NHESS 2023 alternate above is fully fetched and verified.
- The contributor-history evidence is one sentence describing Waze's platform design rather than a mechanism the authors build and evaluate themselves; the authors' own contribution is the clustering-plus-authoritative-comparison method. Cite it for the combination principle, not for a validated reputation algorithm.
- The paper produces a binary "verified Waze report" designation, not a continuous 0–100 score, so it justifies the structure of Antas's trust score but not its specific weighting.
- Venue is Scientific Reports rather than one of the three venues named in the search brief (IEEE Access / IJDRR / CSCW); those venues were searched and the best-fitting hits in them were either closed access or unfetchable.
