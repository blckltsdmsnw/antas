import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * Builds the course report as a .docx matching the formatting of the reference
 * document that had already been accepted.
 *
 *   node docs/paper/build-docx.mjs
 *
 * FORMATTING MEASURED FROM THE REFERENCE, NOT ASSUMED FROM IT. Its
 * `docDefaults` claim Arial 11pt, and every actual run overrides that - 654 runs
 * set Times New Roman and 218 set 24 half-points. Trusting the style sheet would
 * have produced a document in the wrong font at the wrong size.
 *
 *   Times New Roman, 12pt body             (w:sz 24, half-points)
 *   Letter portrait, 1 inch margins        (12240 x 15840, 1440 twips)
 *   No first-line indent, left aligned     (w:ind firstLine=0)
 *   12pt space before and after paragraphs (w:spacing before/after 240)
 *   Bullets at 0.5in with 0.25in hanging   (w:ind left=720 hanging=360)
 *
 * Every property is written inline on each paragraph rather than through named
 * styles, so the output does not depend on a styles.xml Word might substitute
 * or a theme that might not travel with the file.
 */

const OUT_DIR = "docs/paper";
const OUT_NAME = "Antas-Research-Report";
const BUILD = join(process.env.TEMP ?? "/tmp", `antas-docx-${Date.now()}`);

/** XML-escape. Ampersands first, or the escapes themselves get escaped. */
const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * One paragraph's runs. `text` may carry **bold** spans, which are split out
 * rather than written literally - a paper with visible markdown in it reads as
 * unfinished.
 */
function runs(text, { size = 24, italic = false, mono = false } = {}) {
  const font = mono ? "Courier New" : "Times New Roman";
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => {
      const bold = part.startsWith("**") && part.endsWith("**");
      const inner = bold ? part.slice(2, -2) : part;
      const props =
        `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>` +
        `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` +
        (bold ? "<w:b/>" : "") +
        (italic ? "<w:i/>" : "");
      // xml:space preserve, or Word eats the spaces around bold spans.
      return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(inner)}</w:t></w:r>`;
    })
    .join("");
}

function para(text, opts = {}) {
  const {
    size = 24,
    align = "left",
    before = 240,
    after = 240,
    indentLeft = 0,
    hanging = 0,
    italic = false,
    mono = false,
    keepNext = false,
  } = opts;

  const ind = hanging
    ? `<w:ind w:left="${indentLeft}" w:hanging="${hanging}"/>`
    : `<w:ind w:left="${indentLeft}" w:right="0" w:firstLine="0"/>`;

  return (
    `<w:p><w:pPr>` +
    `<w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>` +
    ind +
    `<w:jc w:val="${align}"/>` +
    (keepNext ? "<w:keepNext/>" : "") +
    `</w:pPr>${runs(text, { size, italic, mono })}</w:p>`
  );
}

const title = (t) => para(t, { size: 32, align: "center", before: 0, after: 120 });
const centred = (t) => para(t, { size: 24, align: "center", before: 0, after: 0 });
const h1 = (t) => para(t, { size: 30, before: 400, after: 160, keepNext: true });
const h2 = (t) => para(t, { size: 26, before: 320, after: 120, keepNext: true });
const body = (t) => para(t);
const bullet = (t) =>
  para(`•  ${t}`, { indentLeft: 720, hanging: 360, before: 0, after: 120 });
const note = (t) => para(t, { italic: true, size: 22 });
const code = (t) =>
  para(t, { mono: true, size: 20, before: 120, after: 120, indentLeft: 360 });
const h3 = (t) => para(t, { size: 24, before: 240, after: 80, keepNext: true });
const pageBreak = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

/**
 * A numbered item. Written as literal text rather than through numbering.xml,
 * because a real numPr needs a numbering part and an abstract definition, and
 * the reference document's own lists are plain paragraphs with a hanging
 * indent. Matching what was accepted beats being technically tidier.
 */
const numbered = (n, t) =>
  para(`${n}.  ${t}`, { indentLeft: 720, hanging: 360, before: 0, after: 120 });

/**
 * A table, sized to the printable width.
 *
 * Letter minus 1in margins each side leaves 9360 twips. Column widths are given
 * explicitly and must total that, or Word reflows the table to its own liking
 * and the first column swallows the rest.
 */
function table(widths, rows, { headerRow = true } = {}) {
  const border = (side) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;

  const cell = (text, w, bold) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>` +
    `<w:vAlign w:val="center"/></w:tcPr>` +
    para(bold ? `**${text}**` : text, {
      size: 20,
      before: 40,
      after: 40,
      align: text.length <= 2 ? "center" : "left",
    }) +
    `</w:tc>`;

  const body = rows
    .map(
      (cells, r) =>
        `<w:tr>${cells
          .map((t, i) => cell(t, widths[i], headerRow && r === 0))
          .join("")}</w:tr>`,
    )
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"]
      .map(border)
      .join("")}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    `${body}</w:tbl>` +
    // Word requires a paragraph after a table, or the next block merges into it.
    para("", { before: 0, after: 120 })
  );
}

/** A figure the author pastes an image into, plus its numbered caption. */
function figure(n, caption) {
  return (
    para(`[ Figure ${n} — paste the rendered diagram here ]`, {
      align: "center",
      italic: true,
      size: 22,
      before: 240,
      after: 80,
    }) +
    para(`Figure ${n}. ${caption}`, {
      align: "center",
      size: 20,
      before: 0,
      after: 240,
    })
  );
}

const content = [
  // --- Front matter, centred, matching the reference's title block --------
  title("Antas: A Street-Level Flood Depth Reporting System for Metro Manila"),
  centred("Elijah Olores"),
  centred("Centro Escolar University"),
  centred("Empirical Software Innovation and Interface Prototyping"),
  centred("2026"),
  para("", { before: 200, after: 0 }),

  // === SECTION I ===========================================================
  h1("Section I: Research Foundation"),

  h2("1.1 Problem Statement"),
  body(
    "During a flood, the question a Metro Manila resident actually needs answered is narrow and local: is the water on my street passable right now? Every information source available to them answers a different question.",
  ),
  body(
    "Official warnings operate at the scale of a river basin or a city. They are authoritative about rainfall and river level, and silent about the two hundred metres between a person and the main road. A resident who knows the Marikina River is at second alarm still does not know whether the corner of their own street is ankle-deep or waist-deep. [VERIFY: cite PAGASA's public warning products and their spatial granularity.]",
  ),
  body(
    "The gap is filled informally, by neighbours posting photographs and short messages to Facebook groups and Messenger threads. That channel is fast, local, and genuinely useful, and it fails in three specific ways. First, it is unstructured: a post saying baha na dito cannot be compared, sorted, or aged, and two posts an hour apart cannot be told apart for currency. Second, it is not addressable by location, because a post attaches to a group rather than to a coordinate, so a reader cannot ask what is happening on their own street. Third, it carries no notion of staleness: a photograph taken three hours ago looks exactly like one taken three minutes ago, and floodwater moves in far less than three hours.",
  ),
  body(
    "The consequence is a decision made on bad information. A resident either waits longer than necessary, or walks into water deeper than they expected. Six inches of moving water is enough to knock an adult off their feet, and floodwater hides open drains and live cables. The cost of the missing information is not inconvenience; it is a person stepping into a street they believed was passable. [VERIFY: one industry or government statistic on the scale of urban flooding in Metro Manila. NDRRMC situational reports and MMDA flood-control publications are the credible primary sources.]",
  ),
  body(
    "[VERIFY: at least one peer-reviewed source on crowdsourced or participatory disaster reporting, read before citing. PetaBencana.id, from the MIT Urban Risk Lab, is crowdsourced flood mapping in Jakarta and is the closest published comparison to this work; the Ushahidi platform literature is the other established starting point.]",
  ),
  body(
    "There is a clear need for a tool that collects what residents already report informally, but does so in a structured, located, and time-stamped form, and that is honest about the limits of what it knows. This is the gap Antas aims to fill.",
  ),

  h2("1.2 Related Literature and Studies"),
  body(
    "The literature relevant to Antas falls into six areas: the theoretical basis for treating ordinary citizens as data sources, the empirical record of crowdsourced disaster platforms, the specific problem of trusting that data, the Philippine warning context, the design of interfaces used under stress, and the handling of information that decays with time. Each section below states what the source establishes and how it bears on a decision in this system.",
  ),
  note(
    "Every entry below is a placeholder carrying identifying details that are believed correct but have not been checked here. Read each source and complete the citation before submission. A fabricated or half-remembered reference is checkable and is worse than a missing one. The assignment requires a minimum of three peer-reviewed or credible industry sources; more than three are listed so that the strongest available can be chosen.",
  ),

  h3("A. Theoretical Foundation: Citizens as Sensors"),
  body(
    "**[VERIFY] Goodchild, M. F. (2007). Citizens as sensors: The world of volunteered geographic information. GeoJournal, 69(4).** The paper that named Volunteered Geographic Information and argued that ordinary people carrying location-aware devices constitute a distributed sensor network of enormous reach and uneven reliability. It is the theoretical foundation for the entire premise of Antas: a resident standing in floodwater is an instrument that no rain gauge can replace, because the gauge measures rainfall while the resident measures the street. The paper is equally clear that such data is heterogeneous in quality, which is why this system scores signals rather than accepting them uniformly.",
  ),
  body(
    "**[VERIFY] Literature on the field of crisis informatics.** The study of how information flows through communities during disasters, and how members of the public act as information producers rather than only as victims. Search on the term itself; the field is well established and the foundational work is widely cited. The finding relevant here is that people already self-organise to share hazard information during a crisis, and that formal systems succeed when they structure that behaviour rather than replacing it. Antas is built on precisely that assumption: residents already post flood photographs to Facebook groups, and the contribution of this project is structure, location and time, not the impulse to share.",
  ),

  h3("B. Empirical Precedent: Crowdsourced Disaster Platforms"),
  body(
    "**[VERIFY] PetaBencana.id — MIT Urban Risk Lab, Jakarta.** A crowdsourced flood-mapping platform that collects reports from residents through social messaging channels and renders them on a public map in real time. This is the closest published precedent for Antas and the single most important source to read. It establishes that resident-sourced flood reporting works at city scale in a South-East Asian megacity with comparable flooding, and its published evaluations describe how report volume, verification and decay were handled. Note the difference in approach for the paper's comparison: PetaBencana accepts free-form reports through channels people already use, whereas Antas constrains input to a fixed five-level depth scale, trading reach for comparability.",
  ),
  body(
    "**[VERIFY] Ushahidi platform (2008 onward) and its evaluations.** The original crisis-mapping platform, built during the Kenyan post-election violence and studied extensively since. Its history is the standard reference for the central trade-off in this field: openness produces volume and speed, and simultaneously produces unverifiable and occasionally malicious reports. That trade-off is the direct motivation for the trust-scoring component in Section 2.4, and for the decision that Antas ranks doubtful signals lower rather than refusing them.",
  ),
  body(
    "**[VERIFY] Humanitarian OpenStreetMap Team (HOT) and volunteered mapping during disasters.** Documents large-scale volunteer contribution to mapping in crisis, including in the Philippines after major typhoons. Useful to this paper for its treatment of coverage as uneven and clustered: volunteers map where volunteers are. That is the same limitation Antas has, and it is stated openly in Section 4.4 rather than hidden — barangay coverage is dense in Marikina and Taguig and thin elsewhere.",
  ),

  h3("C. Trust and Verification in Crowdsourced Data"),
  body(
    "**[VERIFY] Research on credibility assessment of social media content during disasters.** The relevant body of work examines how to judge whether an unverified report from an unknown person is likely to be true, using signals such as corroboration by nearby reports, the reporter's history, and consistency with independent data. This literature is the direct justification for the six-group scoring model in Section 2.4, and specifically for the choice to combine reporter history with environmental corroboration rather than relying on either alone.",
  ),
  body(
    "**[VERIFY] Research on misinformation and rumour propagation during emergencies.** Establishes that false or outdated information spreads readily in a crisis, and that corrections propagate more slowly than the claims they correct. This is the argument behind two refusals recorded in Section 4.2: free-text comments beneath a depth reading, and any label describing floodwater as safe. In an unmoderated system a reassuring comment outlives the conditions that produced it.",
  ),

  h3("D. The Philippine Flood Context"),
  body(
    "**[VERIFY] PAGASA public warning products and their spatial granularity.** The Philippine Atmospheric, Geophysical and Astronomical Services Administration issues rainfall advisories and flood bulletins by basin and by area. Cite the agency's own description of its bulletin and rainfall-warning levels. This is the primary-source basis for the central claim of the problem statement: official warnings are authoritative at the scale of a river system and silent at the scale of a street.",
  ),
  body(
    "**[VERIFY] NDRRMC situational reports on flooding in the National Capital Region.** The national council's post-event reports give affected-population and displacement figures. One such report supplies the scale statistic the problem statement needs, and is preferable to a news summary because it is the primary record.",
  ),
  body(
    "**[VERIFY] Project NOAH (Nationwide Operational Assessment of Hazards) and Philippine flood hazard mapping.** A government and university programme producing flood hazard maps for the country. Important for this paper as a contrast rather than a competitor: hazard maps model where flooding is likely under modelled conditions, while Antas reports where water is observed now. The two answer different questions, and saying so protects the paper from the objection that the problem is already solved.",
  ),

  h3("E. Interface Design for Use Under Stress"),
  body(
    "**[VERIFY] Literature on interface design for emergency and high-stress conditions.** The claim to support is that people under stress fall back on routine actions, have reduced working memory, and do not discover controls that are hidden behind gestures. Two decisions in this project rest on it: the emergency control is a plainly labelled tab rather than a long-press on the ordinary report button, and the depth scale is expressed in body parts so that no arithmetic conversion is required.",
  ),
  body(
    "**[VERIFY] Research on mobile usability in outdoor and low-visibility conditions.** Covers legibility in direct sunlight, one-handed reach on large phones, and touch target sizing. This supports the light-only interface on task screens, the 48-pixel minimum target, and the placement of all primary navigation within thumb reach at the bottom of the display — each of which is otherwise merely an assertion of taste.",
  ),

  h3("F. Information Decay and Offline Operation"),
  body(
    "**[VERIFY] Research on temporal decay and the freshness of user-generated observations.** Establishes that the usefulness of an observation falls with age, and that systems presenting old data without marking it lead users to act on conditions that have changed. This is the basis for the two most distinctive rules in Antas: every reading states its age, and past six hours the map refuses to draw cached data at all. Both are unusual enough to need a citation rather than an assertion.",
  ),
  body(
    "**[VERIFY] Literature on offline-first and intermittently connected application design.** Relevant because connectivity degrades in exactly the conditions this application is built for. Supports the decision to cache the application shell and the preparedness guide, and to keep the last successful map snapshot, while stating its age rather than presenting it as live.",
  ),

  h3("Synthesis: The Gap This Project Addresses"),
  body(
    "Taken together the literature establishes four things. Residents are a viable sensor network for hazards that instruments cannot observe at street level. Platforms built on that premise work at city scale, and have done so in a comparable megacity. Their central difficulty is not collection but trust, and the accepted response is to weigh signals rather than to reject them. And official warning systems, which are authoritative, operate at a resolution that cannot answer the question a person on the street is actually asking.",
  ),
  body(
    "What the literature does not supply, and where this project contributes, is the handling of information decay in the interface itself. Existing platforms display reports; the reviewed work says little about refusing to display them once they are too old to be safe. Antas treats staleness as a first-class safety property, states the age of every reading, and declines to draw data beyond six hours. It pairs that with an explicit refusal to imply dispatch capability it does not have. Those two commitments, rather than the collection mechanism, are what distinguish this system from its precedents.",
  ),

  h2("1.3 How Antas Improves Upon Existing Solutions"),
  body("Six differences separate Antas from the tools a Metro Manila resident already has."),
  numbered(
    1,
    "**Street-level resolution.** Official warnings describe a basin; Antas describes a coordinate. A report is attached to the point it was observed at, so the map answers a question about one street rather than one city.",
  ),
  numbered(
    2,
    "**A scale a person can actually read.** Depth is recorded in body parts, from ankle to above head, because somebody standing in water knows where it reaches on them and does not know it is sixty-three centimetres. The scale is the interface.",
  ),
  numbered(
    3,
    "**Every reading carries its age.** A pin states how old it is, and past six hours the map refuses to draw the data at all rather than presenting a stale reading as current. No informal channel does this.",
  ),
  numbered(
    4,
    "**Structured freshness, without free text.** Readers answer whether the water is gone, the same, or higher. The most recent answer leads rather than the most numerous, because water moves and an older consensus describes an earlier moment.",
  ),
  numbered(
    5,
    "**Triage support for the barangay desk.** An emergency signal is scored from corroborating reports, rainfall, elevation, reporter history and evidence quality, so a moderator sees a ranked queue rather than an undifferentiated list.",
  ),
  numbered(
    6,
    "**An explicit refusal to dispatch.** Antas states on every relevant screen that it sends no rescue. This is a feature rather than a missing one: a tool that implies help is coming makes a person wait instead of climbing.",
  ),

  h2("1.4 Functionality Comparison"),
  body(
    "The table below compares Antas with the sources a Metro Manila resident currently relies on during a flood.",
  ),
  table(
    [2760, 1320, 1320, 1320, 1320, 1320],
    [
      ["Function", "PAGASA", "News", "FB groups", "Waze", "Antas"],
      ["Street-level water depth", "❌", "❌", "△", "❌", "✅"],
      ["Structured, comparable readings", "✅", "❌", "❌", "✅", "✅"],
      ["Searchable by location", "❌", "❌", "❌", "✅", "✅"],
      ["States the age of each reading", "✅", "❌", "❌", "△", "✅"],
      ["Refuses to show stale data", "❌", "❌", "❌", "❌", "✅"],
      ["Usable with no account", "✅", "✅", "❌", "❌", "✅"],
      ["Works with no connection", "❌", "❌", "❌", "❌", "✅"],
      ["Filipino-first interface", "△", "✅", "✅", "❌", "✅"],
      ["Confirmation that a report still holds", "❌", "❌", "△", "✅", "✅"],
      ["Triage queue for barangay desks", "❌", "❌", "❌", "❌", "✅"],
      ["States plainly that it cannot dispatch", "❌", "❌", "❌", "❌", "✅"],
    ],
  ),
  note("Legend: ✅ provided, △ partial or incidental, ❌ not provided."),

  h2("1.5 Target Audience and Core User Persona"),
  body("**Name:** Maricel Santos"),
  body("**Role:** Office worker, commuting daily between Marikina and Ortigas."),
  body(
    "**Technical profile:** Uses an Android phone on mobile data. Comfortable with Facebook and Messenger; installs few applications and does not create accounts unless required.",
  ),
  body("**Primary pain points:**"),
  bullet("She sees a PAGASA advisory for Marikina but cannot tell whether her own street is passable."),
  bullet(
    "She checks three Facebook groups and finds photographs with no timestamp and no location, and cannot tell which are from this hour.",
  ),
  bullet(
    "She has previously walked into water deeper than she expected, because the photograph she relied on was hours old.",
  ),
  bullet(
    "During heavy rain her connection is poor, and pages that need a network round trip simply do not load.",
  ),
  body(
    "**Contextual frustration:** She has fifteen minutes to decide whether to leave the office now or wait, and no source she trusts answers the question at the resolution she needs. The secondary user is a barangay disaster desk officer who receives distress reports and must decide which to act on first, with no basis for judging which are credible.",
  ),

  pageBreak(),

  // === SECTION II ==========================================================
  h1("Section II: Software Architecture and Purpose"),

  h2("2.1 Core Purpose and Primary Objective"),
  body(
    "Antas is an observation-sharing system for flood depth. Its primary objective is to turn what residents already report informally into structured, located, time-stamped readings that another resident can act on, and to be explicit about the limits of what those readings support.",
  ),
  body(
    "It is deliberately not a dispatch system. The product states on the guide, on the emergency screen, and in its shared link preview that it sends no rescue. This boundary is the design's organising constraint rather than a disclaimer: a person told that help is coming waits, and waiting is the wrong action when water is rising.",
  ),

  h2("2.2 Functional Requirements (Feature Set)"),
  body("The application is structured around seven interactive features."),
  numbered(
    1,
    "**Depth Map.** The default screen. Reports are drawn as pins coloured along a five-step depth ramp, clustered when they overlap. A cluster takes the depth of its deepest member rather than an average, so eleven ankle-deep reports cannot hide one above-head report behind a reassuring colour.",
  ),
  numbered(
    2,
    "**Report Flow.** A five-level gauge labelled by body part, with an optional photograph and an automatic GPS accuracy check. Where the fix is imprecise the user is warned and asked to confirm, because a report placed on the wrong street is worse than no report.",
  ),
  numbered(
    3,
    "**Freshness Answers.** Three buttons under an existing report, reading gone, the same, and higher, so a reading can be confirmed or contradicted without free text. The most recent answer leads, and ties break toward the worse state.",
  ),
  numbered(
    4,
    "**Emergency Signal (Tulong).** A live photograph and a three-second hold. No account is required: an anonymous session is created silently, because a magic-link sign-in costs minutes that a person in rising water does not have.",
  ),
  numbered(
    5,
    "**Moderator Console.** A triage queue scoped to a barangay, showing each signal's trust score, its supporting evidence, a call button, and directions. Every opening of a signal is recorded.",
  ),
  numbered(
    6,
    "**Preparedness Guide (Gabay).** Hotline numbers first, then a packing checklist and advice for before and during a flood. Cached for offline use, because this is the page most likely to be read with no connection.",
  ),
  numbered(
    7,
    "**Language Toggle.** The whole interface in Filipino or English, with no partial translation, resolved on the server so no screen is ever briefly in the wrong language.",
  ),

  h2("2.3 System Architecture"),
  body(
    "The client is built on the Next.js App Router, using server components for content and client components for the map and interactive controls. Data lives in Supabase: PostgreSQL with geospatial queries, Row Level Security, Storage for photographs, and Realtime for live queue updates. The map is MapLibre GL over CARTO basemaps, switching between day and night styling according to Manila clock time. Rainfall and elevation come from Open-Meteo and feed the trust score.",
  ),
  figure(1, "System architecture. Every path to data passes through Row Level Security."),
  body(
    "The system comprises nine tables across twenty-six migrations, and seventeen database functions. Security is enforced in PostgreSQL rather than in application code: a moderator's barangay scope, the confidentiality of a reporter's phone number, and the visibility of emergency photographs are all database predicates, so no route can bypass them by accident, including a route added later by somebody who has not read this report.",
  ),
  figure(
    2,
    "Entity relationships. Key columns only; profiles extends Supabase's auth.users rather than replacing it.",
  ),

  h2("2.4 Workflow: The Trust Score"),
  body(
    "The most substantial algorithm scores an incoming distress signal from six groups of evidence: corroborating nearby reports, recent rainfall, elevation relative to surroundings, the reporter's history, evidence quality including whether the photograph has been submitted before, and behavioural signals such as account age.",
  ),
  figure(
    3,
    "Trust scoring. A gap in the system's knowledge scores as unknown, never as evidence against the sender.",
  ),
  body(
    "One principle governs the scorer, and it is the strongest design argument in this project: a gap in the system's knowledge is never scored as evidence against the person asking for help. An unreachable weather provider, a photograph that could not be fetched, or a question the sender was never asked all score identically to a clean result. The system ranks signals it knows less about lower; it never refuses one.",
  ),
  body(
    "The distinction matters in practice. The emergency form stopped asking for a depth, so the two checks that exist only to contradict a claimed depth withdraw rather than treating silence as a shallow claim. Otherwise the system would penalise people for a form field it had deliberately chosen not to show them, pushing the fastest askers toward the bottom of the queue.",
  ),

  h2("2.5 Information Hierarchy"),
  figure(
    4,
    "Information hierarchy and core user journeys. There is no onboarding: the map is the first screen.",
  ),
  body(
    "The user flow is Map, then Report Detail, then Freshness Answer, with the tab bar branching to Guide, Report, Me and Tulong. The map is the default screen because the product's premise is a question about a place. Reporting is a raised centre action rather than a peer tab, because it is the single contribution the system asks of its users.",
  ),

  pageBreak(),

  // === SECTION III =========================================================
  h1("Section III: Design Prompt and Rationale"),

  body("**Project Name:** Antas, a street-level flood depth reporting system."),
  body("**App Type:** A mobile-first public safety web application, installable as a PWA."),
  body("**Design Style and UI Guidelines:**"),
  bullet(
    "Light interface on every task screen. It is read outdoors in daylight during heavy rain, which is the one condition where a dark interface is a liability rather than a preference.",
  ),
  bullet(
    "A five-step depth ramp carries all severity meaning: pale blue #7DD3FC for ankle, through #38BDF8, #0284C7 and #1E40AF, to deep purple #581C87 for above-head. Only the water is allowed to look alarming; the surrounding interface stays neutral.",
  ),
  bullet(
    "Ink #0F172A on white #FFFFFF, with a pale wash #F1F5F9 for grouped content. No decorative illustration, no gradients, no glassmorphism.",
  ),
  bullet("**Tone:** Plain, direct, Filipino-first. Never reassuring about water."),
  bullet(
    "**Typography:** A grotesque with signage character for headings, and a public-service sans for interface text.",
  ),
  bullet(
    "Minimum 48-pixel touch targets, with all primary navigation within thumb reach at the bottom of the screen.",
  ),
  body(
    "**User Flow (Navigation):** Map, then Search or Locate, then Report Detail, then Freshness Answer, with Report, Guide, Me and Tulong reachable from the tab bar at any point.",
  ),

  h2("3.1 Prompt 1: Context and Constraints"),
  code(
    "Design a mobile-first flood reporting app for Metro Manila residents. CONTEXT: Users open this during heavy rain, one-handed, on a phone, outdoors in daylight, often on poor mobile data. Many are deciding within seconds whether a street is safe to walk down. CONSTRAINTS: Light interface only. No decorative illustration, gradients or glassmorphism. All primary navigation reachable by thumb at the bottom of the screen. Filipino-first labels. Minimum 48px touch targets. DO NOT include: rescue dispatch, evacuation orders, official authority badges, or any label implying floodwater is safe.",
  ),
  body(
    "**Rationale.** The negative constraints do the real work. An unconstrained generator reaches for the visual language of emergency dashboards, with sirens, alerts and authority, which this system has no right to use. Stating the prohibitions in the prompt is cheaper than rejecting the output afterwards.",
  ),

  h2("3.2 Screen 1: Map (Home Dashboard)"),
  bullet("**Layout:** Full-bleed map filling the viewport, with no header bar; the map is the content."),
  bullet("**Top:** A floating search field labelled Maghanap ng lugar o barangay."),
  bullet(
    "**Overlay:** A compact legend listing five depth levels ordered deepest first, and a weather chip showing current conditions.",
  ),
  bullet(
    "**Bottom:** A tab bar with five items, being Mapa, Gabay, I-report as a raised circular centre button, Ako, and Tulong in red.",
  ),
  body(
    "**Rationale.** The legend is ordered deepest-first so it reads as a warning rather than a neutral scale. The header is omitted because on a phone, three stacked bands of chrome consume roughly a fifth of the screen before the product appears.",
  ),

  h2("3.3 Screen 2: Report Water Depth (Main Action)"),
  bullet(
    "**Main body:** A vertical selector with five options labelled by body part, each in its own colour from pale blue to deep purple, beside a human figure showing where the water reaches.",
  ),
  bullet("**Secondary:** An optional add-photo card, clearly marked as optional."),
  bullet("**Primary action:** A single full-width submit button labelled I-report."),
  body(
    "**Rationale.** The scale is a body because the measurement is taken against a body. A centimetre field would ask the user to convert something they perceive directly into something they must estimate.",
  ),

  h2("3.4 Screen 3: Report Detail (Detail View)"),
  bullet("**Top:** The photograph, if one was submitted, tappable to open full screen."),
  bullet(
    "**Body:** The depth reading with its colour swatch, the centimetre range beneath it, and the age of the report in bold beside the wall-clock time it was taken.",
  ),
  bullet("**Bottom:** Kumusta na? with three buttons reading Wala na, Ganoon pa rin, and Mas mataas na."),
  body(
    "**Rationale.** Age is set in bold because staleness is the property that decides whether the reading can be acted on. The three-state control replaces the free-text comments the generator proposed; see Section 4.2.",
  ),

  h2("3.5 Screen 4: Gabay (Guide and Hotlines)"),
  bullet(
    "**First section:** Emergency numbers, with 911 as a single large filled button and coordination desks below it as quieter outlined buttons.",
  ),
  bullet("**Then:** A go-bag checklist with tickable items that persist without an account."),
  bullet("**Then:** Advice for before and during a flood, in short titled sections."),
  body(
    "**Rationale.** The hotline section is placed first because it is the only part useful when water is already rising. One filled button, and only one, so the number that dispatches rescue is visually unambiguous.",
  ),

  h2("3.6 Screen 5: Tulong (Emergency)"),
  bullet(
    "**Top:** A notice stating that no real rescue service receives this and that 911 should be called in a real emergency.",
  ),
  bullet("**Body:** A live camera capture, with the gallery deliberately unavailable."),
  bullet("**Action:** A press-and-hold control requiring three seconds."),
  bullet(
    "**After sending:** A status line reporting only what has actually happened, and an optional field for a contact number.",
  ),
  body(
    "**Rationale.** The hold is an anti-accident measure rather than an obstacle, and the live-capture requirement is an anti-abuse one. The post-send status reports completed acts and never a promise.",
  ),

  h2("3.7 Conversational Iteration"),
  code(
    "Refine: reduce the card treatment. Too many surfaces are raised, which flattens the hierarchy. Keep cards only where content is genuinely grouped, and let the depth colour ramp run edge to edge in the selector.",
  ),
  body(
    "**Rationale.** The first generation applied card containers uniformly. When everything is elevated nothing is emphasised, and the depth ramp, the most important information on the screen, was competing with its own container.",
  ),

  pageBreak(),

  // === SECTION IV ==========================================================
  h1("Section IV: Reflection and Usability Evaluation"),

  h2("4.1 Evaluation of Generated Stitch Layout Alignment with User Needs"),
  body(
    "The generated prototype translated the research into a usable interface, and its structure aligns with Maricel's expectations because it mirrors applications she already uses: a map with a bottom tab bar, a search field at the top, and a raised centre action.",
  ),
  body("**Strengths and Alignment:**"),
  bullet(
    "**Task fluidity.** The flow from Map to Detail to Answer matches how the question is actually asked: where am I, what is here, is it still true. No onboarding is required.",
  ),
  bullet(
    "**Reachability.** Moving navigation to a bottom tab bar suited one-handed phone use in rain, and freed the vertical space the map needed.",
  ),
  bullet(
    "**Discoverability of contribution.** A my-reports screen resolved a real gap: a submitted report previously vanished into the map with no way to see or withdraw it.",
  ),
  bullet(
    "**Locating oneself.** The generated locate control answers take me to me, which proved a more common need than searching for a named place.",
  ),

  h2("4.2 Where the Generated Layout Was Actively Unsafe"),
  body(
    "This is the more important finding. Several generated proposals were plausible, well-composed, and would have caused harm. Each was rejected, and the reason was the same every time: they assumed an authority relationship, or live operational data, that the system does not have.",
  ),
  bullet(
    "**Official alert broadcasts with evacuation orders.** An evacuation order is an instruction only an authority may issue.",
  ),
  bullet(
    "**Evacuation centre capacity, shown as a percentage full.** Being wrong sends a family through floodwater to a centre that is full. Capacity is not ours to know.",
  ),
  bullet("**Verified-authority badges.** These impersonate an institution the project has no relationship with."),
  bullet(
    "**A Ligtas, or safe, label on ankle-deep water.** No flood depth is safe; ankle-deep water hides open drains and moves fast.",
  ),
  bullet(
    "**A satellite basemap with filled heat zones.** This claims continuous area knowledge derived from sparse point reports.",
  ),
  bullet(
    "**Free-text comments under a report.** Nobody moderates this application, and a comment saying the water is gone could sit beneath water that is still chest-deep. It was replaced by the three-state control on Screen 3.",
  ),

  h2("4.3 What This Says About AI-Assisted Interface Design"),
  body(
    "The generator was reliably good at conventions: where controls belong, what a mobile flood application usually contains, and how to structure a tab bar. It was reliably unable to distinguish what the system is entitled to claim. It proposed an authority badge and a capacity indicator with exactly the same confidence as it proposed a search field, because visually they are all simply components.",
  ),
  body(
    "The judgement that separates them is not a design skill. It is knowing what data the system actually holds and what it may honestly assert, which the tool cannot know and which no prompt reliably supplies. Two of the refusals above, the Ligtas label and free-text comments, would have passed an ordinary usability review; they fail only against the question of what happens if this is wrong while somebody is standing in water.",
  ),
  body(
    "The practical conclusion is that AI interface generation was most valuable for layout and convention, and required a domain-informed reviewer with the authority to refuse.",
  ),

  h2("4.4 Usability Evaluation Against the Target User"),
  table(
    [4680, 4680],
    [
      ["Requirement", "Outcome"],
      ["Readable outdoors in daylight", "Light interface on all task pages; map follows the Manila clock"],
      ["Usable one-handed", "All navigation in a bottom tab bar; 48-pixel minimum targets"],
      ["Usable on poor connectivity", "Shell and guide cached; map keeps its last snapshot and states its age"],
      ["Usable with no account", "Emergency signal requires none; neither do the map or the guide"],
      ["Readable by non-Tagalog speakers", "Full Filipino and English toggle, with no partial translation"],
    ],
  ),
  body(
    "**Remaining limitations, stated rather than hidden.** Barangay granularity is uneven outside Marikina, Taguig and the City of Manila, where every other city is represented by a single placeholder centroid. The hotline numbers were supplied rather than independently verified against the issuing agency's own publication. And the personas were derived from design constraints and local knowledge rather than validated through formal user interviews.",
  ),

  h2("Use Case"),
  body(
    "Antas is a flood depth reporting system that helps Metro Manila residents decide whether a street is passable. The user opens the map, which loads without an account and shows nearby reports as coloured pins. The user may search for a place or locate themselves, then tap a pin to see the depth, the photograph if one exists, and how long ago it was recorded. If the reading is out of date, the user answers whether the water is gone, the same, or higher. To contribute, the user taps I-report, selects a depth on the body-scale gauge, optionally adds a photograph, and submits; the system records the location and the time and publishes the pin. In an emergency, the user taps Tulong, takes a live photograph, and holds the send control for three seconds; the system creates an anonymous session, scores the signal, and places it in the barangay's queue, then reports back only what has actually happened to it. A moderator opens the queue, reviews the score and its evidence, calls the reporter if a number was left, and confirms or dismisses the signal. Every opening of a signal is recorded. Throughout, the system states that it does not dispatch rescue.",
  ),

  h2("Software Interface"),
  body("**Prototype Link:** [PASTE YOUR GOOGLE STITCH SHARE LINK HERE]"),
  body("**Live Application:** https://antas-one.vercel.app"),
  body("**Source Repository:** https://github.com/blckltsdmsnw/antas"),

  h2("References"),
  note(
    "Placeholders carrying identifying details believed correct but not verified here. Replace each with a full APA entry once you have read the source, and delete any you do not use. Do not submit an entry you have not opened.",
  ),
  body(
    "[VERIFY] Goodchild, M. F. (2007). Citizens as sensors: The world of volunteered geographic information. GeoJournal, 69(4). Confirm volume, issue and page range.",
  ),
  body(
    "[VERIFY] Humanitarian OpenStreetMap Team. Volunteered mapping in disaster response. Organisational publications and case studies, including Philippine typhoon responses.",
  ),
  body(
    "[VERIFY] MIT Urban Risk Lab. PetaBencana.id: Crowdsourced flood mapping for Jakarta. Retrieve the platform's own published description or an associated peer-reviewed evaluation.",
  ),
  body(
    "[VERIFY] Metropolitan Manila Development Authority (MMDA). Flood control and flood monitoring publications.",
  ),
  body(
    "[VERIFY] National Disaster Risk Reduction and Management Council (NDRRMC). Situational report on flooding in the National Capital Region. Cite the specific report and date used.",
  ),
  body(
    "[VERIFY] Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA). Public weather and flood warning products, including rainfall warning levels.",
  ),
  body(
    "[VERIFY] Project NOAH / Department of Science and Technology. Nationwide Operational Assessment of Hazards: flood hazard mapping for the Philippines.",
  ),
  body(
    "[VERIFY] Ushahidi. Platform documentation and peer-reviewed evaluations of crowdsourced crisis mapping since 2008.",
  ),
  body(
    "[VERIFY] Source on crisis informatics — the study of public information behaviour during disasters. Locate a foundational review and cite it in full.",
  ),
  body(
    "[VERIFY] Source on credibility assessment of user-generated content during emergencies.",
  ),
  body(
    "[VERIFY] Source on interface design for emergency or high-stress use.",
  ),
  body(
    "[VERIFY] Source on mobile usability in outdoor and low-visibility conditions.",
  ),
  body(
    "[VERIFY] Source on temporal decay and freshness of user-generated observations.",
  ),
].join("");

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${content}` +
  `<w:sectPr>` +
  `<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>` +
  `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>` +
  `</w:sectPr></w:body></w:document>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const rels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

// Flat files with the archive path chosen explicitly below, so nothing depends
// on how a directory tree happens to be walked.
const parts = [
  ["[Content_Types].xml", contentTypes],
  ["_rels/.rels", rels],
  ["word/document.xml", documentXml],
];

parts.forEach(([name, xml], i) => writeFileSync(join(BUILD, `part${i}`), xml));

const outPath = join(OUT_DIR, `${OUT_NAME}.docx`);

/**
 * Built with ZipArchive rather than `Compress-Archive`.
 *
 * Compress-Archive writes entry names with BACKSLASHES on Windows PowerShell -
 * `word\document.xml` - and the OOXML package spec requires forward slashes.
 * The file looks like a valid zip, unpacks fine at a shell, and Word refuses it.
 * Caught by listing the entries rather than by trusting that the archive was
 * created without error.
 */
const ps = [
  "Add-Type -AssemblyName System.IO.Compression.FileSystem",
  `$out = '${outPath.replace(/'/g, "''")}'`,
  "if (Test-Path $out) { Remove-Item $out -Force }",
  "$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')",
  ...parts.map(([name], i) => {
    const src = join(BUILD, `part${i}`).replace(/'/g, "''");
    return (
      `$e = $zip.CreateEntry('${name}'); ` +
      `$w = New-Object System.IO.StreamWriter($e.Open()); ` +
      `$w.Write([System.IO.File]::ReadAllText('${src}')); $w.Dispose()`
    );
  }),
  "$zip.Dispose()",
].join("; ");

execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });

rmSync(BUILD, { recursive: true, force: true });
console.log(`Wrote ${outPath}`);
console.log("Times New Roman 12pt - Letter - 1in margins - no first-line indent");
console.log("Four figure placeholders remain; paste the rendered diagrams in.");
