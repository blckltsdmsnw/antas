# Slot 8 — Information decay and offline operation
Status: FOUND

## Recommended source
APA: Liu, B., Wang, Y., & Li, Y. (2024). The effect of time display format on cognitive performance of integrated meteorological radar information. *Behavioral Sciences, 14*(9), Article 847. https://doi.org/10.3390/bs14090847
Year: 2024
DOI/URL fetched: https://doi.org/10.3390/bs14090847 (302 → https://www.mdpi.com/2076-328X/14/9/847; full text read at https://pmc.ncbi.nlm.nih.gov/articles/PMC11429408/)
Venue: Behavioral Sciences (MDPI), vol. 14, issue 9, article 847
Peer reviewed: yes (open access, CC BY; PMCID PMC11429408)

## Supporting quote

> "Delayed information can cause pilots to misinterpret the true weather conditions and impair their situational awareness, potentially endangering the safety of pilots and aircraft operating near severe weather systems."

> "Studies have shown that pilots tend to overlook the latency of integrated meteorological images or underestimate the significant impact of the uncertainty introduced by the delay on avoidance of hazardous weather and navigation decisions."

> "The length of delay time is an important factor affecting individual time cognition, and it can also affect the cognition of radar information. The longer the delay time, the more difficult it is to identify the time and understand the information."

> "A proper time display format is essential for pilots to understand integrated meteorological radar information, thereby making informed flying decisions and steering clear of hazardous weather."

> "The reasonable time display format can reflect the delay time of weather information in a simple and understandable way, which helps to reduce the cognitive load of pilots"

Directly relevant precedent for a graded staleness treatment, quoted verbatim from the same paper:

> "the Weather Services International (WSI) system communicates time information in a 'minute–second' digital format. At the same time, the length of the delay time is distinguished by different colors: green means the delay time is less than five minutes, yellow means five to ten minutes, and more than ten minutes is indicated by orange-red."

> "the actual delay time range of current meteorological radar products ranging from 5 min to more than 20 min"

## How it supports the paper
Liu et al. study a hazard display whose underlying observations are always some minutes old, and they establish the exact failure mode Antas is designed against: users who are not made to reckon with an observation's age "misinterpret the true weather conditions", because they "overlook the latency" or "underestimate the significant impact of the uncertainty introduced by the delay." That is the empirical warrant for stating the age of every flood reading rather than rendering it as a bare current value — the paper's finding that the *format* in which age is communicated measurably changes how well users grasp the delay is what turns age-labelling from a stylistic choice into a design requirement. Their citation of the operational WSI convention, where delay is bucketed by colour (green under five minutes, yellow five to ten, orange-red beyond ten), is a working precedent for treating information age as a graded quantity with thresholds, which is what Antas's six-hour refusal is: a threshold past which the reading is judged to have decayed beyond the point where any labelling can make it safe to draw. The paper also supports the direction of the decay — "the longer the delay time, the more difficult it is to identify the time and understand the information" — so the cost of showing an old reading rises with its age rather than staying flat.

## Coverage
Temporal decay / stale data risk: yes
Offline-first / intermittent connectivity: no

## Alternates considered
- Hua, L., Ling, C., & Thomas, R. (2022). Effects of delayed weather radar images on pilots' spatial awareness. *Applied Ergonomics, 98*, 103598. https://doi.org/10.1016/j.apergo.2021.103598 — Verified real (PMID 34607162; Crossref: Applied Ergonomics vol. 98, print issue January 2022). Conceptually the single best match in the whole search: NEXRAD images "delayed up to 20 min", 31 pilots misestimating current storm position, and the abstract ties pilots' "underappreciating or ignoring the time delay" to two fatal accidents. Not chosen for two reasons: it is paywalled (I could not retrieve verbatim body text, only paraphrase from PubMed/Europe PMC), and its e-pub date is 1 October 2021, so a strict 2022+ check could go either way depending on whether the marker uses the issue year or the online date. Recommended as the fallback if the marker prefers it, and as a natural companion citation.
- Ashista, H., Comas, A. S., Selby, T., Essar, M. Y., Alawa, J., Al-Hajj, S., & Nelson, E. (2026). An offline-first electronic health record for vulnerable populations: A mixed-methods feasibility study. *PLOS Digital Health*. https://doi.org/10.1371/journal.pdig.0001204 — Verified real and fetched; peer-reviewed, gold OA, 2026. Genuinely covers the *second* half (offline-first architecture under intermittent connectivity in low-resource settings; local-first with deferred sync). Not chosen as the primary because it says nothing about temporal decay or stale-data labelling, which the brief names as the key half. Use it as the companion citation if the paper wants the offline-first claim supported directly.
- Syukron, M., Madugalla, A., Shahin, M., & Grundy, J. (2024). *Engineering for crisis management: A user-centred analysis of disaster mobile applications* (arXiv:2407.08145). — Fetched; analyses 70 disaster apps and their user reviews, and does touch both halves ("many disaster apps require a stable or high-speed internet connection, which can limit access for users in rural or low-connectivity areas"; user complaints about late alerts and about wanting local mirroring for offline use). Not chosen: it is an arXiv preprint with no journal venue as of the latest version (v3, May 2026), and its treatment of staleness is anecdotal review-mining rather than a finding about information decay.

## Caveats
- **Domain mismatch, mechanism match.** Liu et al. is aviation human factors, not crisis informatics or flood mapping. The paper will need to make the transfer explicit — the shared structure is a safety-critical map of a fast-moving hazard drawn from observations that are inherently minutes-to-hours old, viewed by a non-expert-in-latency user who must decide whether to proceed. Nothing in the finding is aviation-specific, but a reader will notice the domain jump, so cite it for the mechanism, not for flood-domain authority.
- **Partial coverage.** This source establishes the temporal-decay and unmarked-stale-data halves only. It does not address offline-first design, service-worker shell caching, or intermittent connectivity in developing regions. If the paper needs the offline-first claim citation-backed rather than asserted, pair it with the PLOS Digital Health item above; a single 2022+ source covering both halves credibly does not appear to exist.
- **No source found that justifies six hours specifically.** The six-hour cutoff is not a number any source in the window derives. Liu et al. supports the *shape* of the rule (age matters, it must be shown, the penalty grows with age, operational systems already bucket delay by thresholds) but the specific threshold remains the paper's own design decision and should be presented that way.
- The quoted sentences were read from the open-access PMC full text (PMC11429408), which is the version of record under CC BY. The MDPI landing page itself returns HTTP 403 to automated fetches; the DOI redirect to it was confirmed.
