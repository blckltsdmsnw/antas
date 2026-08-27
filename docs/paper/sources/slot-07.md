# Slot 7 — Interface design for use under stress
Status: FOUND

## Recommended source
APA: Knysh, A., & Pohrebniak, T. (2026). Mental health app crisis support assessment framework: Development and pilot testing. *Frontiers in Digital Health, 8*, Article 1814547. https://doi.org/10.3389/fdgth.2026.1814547
Year: 2026
DOI/URL fetched: https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2026.1814547/full (also verified at https://pmc.ncbi.nlm.nih.gov/articles/PMC13290974/)
Venue: Frontiers in Digital Health (peer-reviewed journal, CC BY 4.0 open access)
Peer reviewed: yes

## Supporting quote
> "Individuals in crisis may experience cognitive constriction, tunnel vision, agitation, and impaired decision-making – conditions under which each additional navigation tap or ambiguous label increases the risk that a user abandons the task entirely."

Supplementary verbatim passages from the same article:

> "Crisis resources should be reachable within one or two interactions from any screen."

> "An interface that buries a hotline number behind three navigation screens fails during acute crisis."

> "Crisis content must be accurate, non-triggering, and actionable. Clear instructions (what to do now, whom to contact, when to escalate) are essential because distressed users may have reduced capacity to process complex information."

> "Discovery required either encountering them in chat or deliberately searching through menus."

> "Instructions appeared in pale grey and small font."

## How it supports the paper
Knysh and Pohrebniak evaluate how reachable emergency/crisis functions are inside real apps, and they state the mechanism Antas relies on: a person in acute crisis is cognitively constricted, has tunnel vision, and has reduced capacity to process complex information, so every extra navigation tap or ambiguous label raises the chance the task is abandoned. That is a direct argument for Antas placing the emergency control as a plainly labelled tab in the bottom bar — persistently visible and one tap from any screen — rather than behind a long-press or hidden gesture on the ordinary report button; the authors' finding that some apps' crisis material was discoverable only by deliberately searching through menus is exactly the failure mode a hidden gesture reproduces. The same "reduced capacity to process complex information" claim supports the body-part depth scale (ankle/knee/waist/chest/above head), because recognising a picture of your own body against floodwater requires no numeric estimation or unit conversion held in mind. Their criticism of pale grey, small-font instructions that made critical content "appear optional" also backs Antas's high-contrast, large-type, light-only treatment of the reporting controls.

## Coverage
Stress / working memory / hidden controls: partial — yes for stress-degraded cognition (cognitive constriction, tunnel vision, reduced capacity to process complex information) and yes for controls that are buried or discoverable only by search; **no** for "falls back on routine actions" (habit vs. goal-directed control is never discussed) and no for a measured working-memory effect.
Outdoor legibility / touch target size: partial — the article criticises small, low-contrast, hierarchy-free text and lists "adequate touch targets" as an accessibility criterion, but gives no pixel/dp figure and says nothing about daylight or outdoor viewing.

## Alternates considered
- Still, B., & Clebone, A. (2025). *Does cognitive aid app design influence the speed of actions during a critical event?: A simulation study.* Pediatric Anesthesia, 35, 10.1111/pan.15037 — fetched and real. Shows information is found significantly faster in a purpose-organised app than a linear list during a simulated critical event (median 6 s vs 10.5 s, p = 0.023), which supports low-navigation-depth emergency UI, but the article never discusses stress physiology, working memory, or hidden/gestural controls.
- *Enhancing emergency response: The critical role of interface design in mining emergency robots* (Robotics, 2025, 10.3390/robotics14110148) — topically on "interface design under emergency stress", but MDPI returned HTTP 403 to every fetch attempt, so it could not be verified per the hard rules; domain (teleoperated mine-rescue robots) is also distant from a citizen phone app.
- *GhostUI: Unveiling hidden interactions in mobile UI* (CHI 2026, 10.1145/3772318.3790283) — would be the ideal citation for the "users do not discover hidden gestures" claim specifically, and it is a real CHI paper, but the ACM Digital Library returned HTTP 403 so no passage could be fetched and quoted. It also does not address stress. Worth a second attempt from a network that can reach dl.acm.org.

## Caveats
- **Partial coverage, second source likely needed.** This citation carries the stress/impaired-cognition and don't-bury-the-control half. It does **not** carry the 48-pixel minimum target, and it does not carry outdoor/sunlight legibility at all. For the 48 px figure, cite a standards/measurement source (WCAG 2.2 SC 2.5.8 Target Size (Minimum), or a 2022+ empirical target-size study) rather than stretching this one; for daylight legibility, a separate source is required.
- **Domain distance.** The study is about mental-health crisis support features in four commercial apps, not physical-hazard or flood reporting. The transferable claim is about crisis-state cognition and interaction cost, not about flooding. Frame the citation that way in the paper.
- **Evidence type.** It is a framework-development plus small pilot evaluation (heuristic scoring of a handful of apps), not a controlled experiment with stressed participants. The cognitive-constriction statement is an argued premise grounded in the crisis-intervention literature, not an original measurement in this paper.
- **Do not overclaim "stress makes people fall back on routine actions."** Recent primary literature actively disputes it — e.g. *No evidence for increased habitual or decreased goal-directed action control after acute stress* (PLOS One, 2025, 10.1371/journal.pone.0327807) and *Does stress consistently favor habits over goal-directed behaviors?* (Neurobiology of Stress, 2023, 10.1016/j.ynstr.2023.100528). Antas should argue the labelled-tab decision from interaction cost and discoverability under narrowed attention, which this source does support, rather than from a stress-to-habit shift, which it does not.
- Very recent (published 10 June 2026), so citation counts are nil; open access, no paywall.
