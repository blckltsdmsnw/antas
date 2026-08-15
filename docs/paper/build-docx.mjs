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
    "[VERIFY: at least one peer-reviewed source, dated 2022 or later, on crowdsourced or participatory disaster reporting. See the search brief under Section 1.2A. Recent work on PetaBencana.id, the crowdsourced flood-mapping platform in Jakarta, is the closest published comparison to this project.]",
  ),
  body(
    "There is a clear need for a tool that collects what residents already report informally, but does so in a structured, located, and time-stamped form, and that is honest about the limits of what it knows. This is the gap Antas aims to fill.",
  ),

  h2("1.2 Related Literature and Studies"),
  body(
    "The literature relevant to Antas falls into five areas: the recent record of crowdsourced disaster reporting platforms, the problem of trusting citizen-contributed data, the Philippine flood and warning context, the design of interfaces used under stress, and the handling of information that decays with time. Each entry states what the source establishes and which decision in this system it supports.",
  ),
  note(
    "TO COMPLETE BEFORE SUBMISSION. Each entry gives an APA citation line to be filled in, followed by its discussion paragraph. The citation lines are deliberately blank where author, year, title and venue belong: those details are not invented here, because a fabricated reference is checkable and is worse than a missing one. Each entry carries a search brief naming the terms and venues most likely to surface a suitable source. All sources must be dated 2022 or later. The requirement is a minimum of three; more slots are provided than needed, so the strongest can be kept and the rest deleted.",
  ),
  note(
    "A note on the date restriction. The foundational works in this field - the paper that named volunteered geographic information, and the first crisis-mapping platforms - all fall well outside the window. Do not cite them, and do not cite anything that merely quotes them. Cite instead a recent review, replication or application that restates the concept from within the window, which is standard practice when a date range is imposed and is what the search terms below are written to find.",
  ),

  h3("A. Crowdsourced and Participatory Disaster Reporting"),
  body("**Citation 1:** ____________ (20__). ____________. ____________, __(_), ___-___."),
  note(
    "Search brief: Google Scholar, filtered 2022 onward. Terms: crowdsourced flood reporting; participatory flood mapping; volunteered geographic information flood; citizen reporting urban flooding. Venues likely to carry it: International Journal of Disaster Risk Reduction; Natural Hazards; ISCRAM conference proceedings; Sustainability. Search also for recent work on PetaBencana.id, the crowdsourced flood-mapping platform operating in Jakarta, which is the closest precedent to this project.",
  ),
  body(
    "**What this source must establish, and how it connects to Antas.** That resident-contributed flood observations are viable at city scale, and how such a platform handles report volume and geographic coverage. This is the empirical warrant for the premise of the project: a person standing in floodwater is an instrument no rain gauge can replace, because the gauge measures rainfall while the resident measures the street. Where the source describes free-form reporting, note the contrast: Antas constrains input to a fixed five-level depth scale, trading reach for comparability between reports.",
  ),

  body("**Citation 2:** ____________ (20__). ____________. ____________, __(_), ___-___."),
  note(
    "Search brief: terms: social media disaster response; citizen sensing emergency management; crisis informatics review. A recent review article is ideal here, because it restates the foundational position from within the date window.",
  ),
  body(
    "**What this source must establish, and how it connects to Antas.** That members of the public already share hazard information during a crisis through whatever channels they have, and that formal systems succeed by structuring that behaviour rather than replacing it. This justifies the product's basic shape: residents already post flood photographs to Facebook groups, and the contribution of Antas is structure, location and time, not the impulse to share.",
  ),

  h3("B. Trust, Verification and Data Quality"),
  body("**Citation 3:** ____________ (20__). ____________. ____________, __(_), ___-___."),
  note(
    "Search brief: terms: credibility assessment user-generated content disaster; trust crowdsourced data quality; verification citizen reports emergency. Venues: IEEE Access; International Journal of Disaster Risk Reduction; ACM CSCW proceedings.",
  ),
  body(
    "**What this source must establish, and how it connects to Antas.** How the reliability of an unverified report from an unknown person can be estimated, using signals such as corroboration by nearby reports, the contributor's history, and consistency with independent environmental data. This is the direct justification for the six-group trust score in Section 2.4, and specifically for combining reporter history with environmental corroboration rather than relying on either alone.",
  ),

  body("**Citation 4:** ____________ (20__). ____________. ____________, __(_), ___-___."),
  note(
    "Search brief: terms: misinformation during disasters; rumour propagation emergency social media; outdated information crisis communication.",
  ),
  body(
    "**What this source must establish, and how it connects to Antas.** That false or outdated information spreads readily during an emergency, and that corrections travel more slowly than the claims they correct. This supports two refusals recorded in Section 4.2: free-text comments beneath a depth reading, and any label describing floodwater as safe. In a system nobody moderates, a reassuring comment outlives the conditions that produced it.",
  ),

  h3("C. The Philippine Flood Context"),
  body(
    "**Citation 5:** Philippine Atmospheric, Geophysical and Astronomical Services Administration. (20__). ____________. Retrieved from ____________",
  ),
  note(
    "Search brief: PAGASA's own website, 2022 onward. Look for the published description of rainfall warning levels and flood bulletins. A government primary source is both easy to verify and inherently current, which makes it the safest way to satisfy the date restriction.",
  ),
  body(
    "**What this source must establish, and how it connects to Antas.** That official warnings are issued by basin and by area rather than by street. This is the primary-source basis for the central claim of the problem statement: the warnings are authoritative at the scale of a river system and silent at the scale of a doorstep. Antas does not compete with them; it answers the question they are not designed to answer.",
  ),

  body(
    "**Citation 6:** National Disaster Risk Reduction and Management Council. (20__). ____________. Retrieved from ____________",
  ),
  note(
    "Search brief: NDRRMC situational reports for a named flooding event in the National Capital Region, 2022 onward. Cite the specific report and its date. The southwest monsoon flooding of July 2024 falls within the window and is well documented.",
  ),
  body(
    "**What this source must establish, and how it connects to Antas.** Affected-population or displacement figures for a recent flooding event in Metro Manila. This supplies the scale statistic the problem statement needs, and the primary record is preferable to a news summary of it.",
  ),

  h3("D. Interface Design for Use Under Stress"),
  body("**Citation 7:** ____________ (20__). ____________. ____________, __(_), ___-___."),
  note(
    "Search brief: terms: emergency application usability; user interface design high stress; mobile usability outdoor sunlight legibility; touch target size mobile accessibility. Venues: ACM CHI proceedings; International Journal of Human-Computer Studies; Applied Ergonomics.",
  ),
  body(
    "**What this source must establish, and how it connects to Antas.** That people under stress fall back on routine actions, hold less in working memory, and do not discover controls hidden behind gestures. Two decisions rest on this: the emergency control is a plainly labelled tab rather than a long-press on the ordinary report button, and depth is expressed in body parts so that no arithmetic conversion is required. Where the source also covers outdoor legibility and touch target sizing, it additionally supports the light-only interface and the 48-pixel minimum target.",
  ),

  h3("E. Information Decay and Offline Operation"),
  body("**Citation 8:** ____________ (20__). ____________. ____________, __(_), ___-___."),
  note(
    "Search brief: terms: temporal decay user-generated content; information freshness real-time systems; offline-first application design; intermittent connectivity mobile developing regions.",
  ),
  body(
    "**What this source must establish, and how it connects to Antas.** That the usefulness of an observation falls with age, and that presenting old data without marking it leads users to act on conditions that have changed. This is the basis for the two most distinctive rules in this system: every reading states its age, and past six hours the map refuses to draw cached data at all. Both are unusual enough to require a citation rather than an assertion. Work on offline-first design additionally supports caching the application shell and the preparedness guide, since connectivity degrades in exactly the conditions the product exists for.",
  ),

  h3("Synthesis: The Gap This Project Addresses"),
  body(
    "Taken together the literature establishes three things. Residents are a viable source of hazard information that instruments cannot capture at street level, and platforms built on that premise operate successfully in comparable cities. The central difficulty of such platforms is not collection but trust, and the accepted response is to weigh signals by corroboration and history rather than to reject them outright. And official warning systems, which are authoritative and necessary, work at a spatial resolution that cannot answer the question a person standing on a street is actually asking.",
  ),
  body(
    "What the reviewed literature does not address, and where this project contributes, is the treatment of information decay in the interface itself. Existing platforms display reports; the literature says comparatively little about refusing to display them once they are too old to be acted on safely. Antas treats staleness as a first-class safety property: every reading states its age, and beyond six hours the map draws nothing and says why. It pairs that with an explicit refusal to imply a dispatch capability it does not have. Those two commitments, rather than the collection mechanism, are what distinguish this system from its precedents.",
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

  h2("1.5 Target Audience and Core User Personas"),
  body(
    "Two personas drive the design, and they use the system for opposite reasons: one is deciding whether to move, the other is deciding whom to help first. A third consideration, the asymmetry between reading and contributing, is set out at the end because it shapes the interface more than either persona alone.",
  ),

  h3("1.5.1 Primary Persona: Maricel Santos"),
  body("**Age and location:** 34, renting a ground-floor unit in Barangay Malanday, Marikina."),
  body(
    "**Role:** Administrative assistant in an Ortigas office. Commutes daily by jeepney and MRT, leaving home before seven and returning after six.",
  ),
  body(
    "**Household:** Lives with her mother, who is 61 and has limited mobility, and a nine-year-old son. Her decisions are not only about herself: if the water rises she must decide whether to move her mother upstairs to a neighbour's unit, and whether her son's school route is passable.",
  ),
  body(
    "**Device and connectivity:** A mid-range Android phone, three years old, on prepaid mobile data. Storage is nearly full, so she is reluctant to install new applications. During heavy rain her signal degrades and pages that require a network round trip frequently fail to load. Battery is a live concern during a brownout.",
  ),
  body(
    "**Digital habits:** Facebook and Messenger daily; two barangay community groups and one Marikina weather page. She uses Google Maps for unfamiliar routes but not for her commute, which she knows. She has never created an account for a local government service and is wary of giving a mobile number to an application she does not recognise.",
  ),
  body("**Goals:**"),
  bullet(
    "**Primary:** Decide, within the next few minutes, whether her street and her commute are passable right now.",
  ),
  bullet(
    "**Secondary:** Know early enough to move her mother and belongings upstairs before the water reaches the doorstep.",
  ),
  bullet(
    "**Tertiary:** Warn her neighbours, which she already does by posting to the barangay group.",
  ),
  body("**Primary pain points:**"),
  bullet(
    "She sees a PAGASA advisory naming Marikina and still cannot tell whether the corner of her own street is ankle-deep or waist-deep. The warning is true and unusable at her scale.",
  ),
  bullet(
    "She checks three Facebook groups and finds photographs with no timestamp and no location. She cannot tell which were taken this hour, and the comments contradict each other.",
  ),
  bullet(
    "She has walked into water deeper than she expected, because the photograph she relied on turned out to be from the previous evening. Six inches of moving water is enough to take an adult off their feet.",
  ),
  bullet(
    "When the rain is heaviest her connection is worst, so the moment she most needs information is the moment least likely to load.",
  ),
  bullet(
    "She does not know which number to call for her own barangay, and has never found a list she trusted enough to save.",
  ),
  body(
    "**Contextual frustration:** It is 4:40 in the afternoon and it has been raining for three hours. She has perhaps fifteen minutes to decide whether to leave now, wait for the rain to ease, or stay in the office overnight. Her mother has phoned to say water has reached the gate. Every source available answers a broader question than the one she is asking, and the one channel that is specific enough, the barangay group, gives her photographs she cannot date.",
  ),
  body(
    "**Why she might not adopt the tool, which the design must answer:** she will not create an account to look at a map; she will not install anything large; and she will abandon a page that does not load on a weak connection. Antas therefore requires no account to read or to send an emergency signal, is installable but works as a web page, and caches its shell and guide so that something useful survives a failed connection.",
  ),
  body(
    "**What success looks like for her:** she opens the map, sees that the reading two streets away is knee-deep and eleven minutes old, and leaves immediately rather than waiting. Or she sees that it is above head height and does not leave at all.",
  ),

  h3("1.5.2 Secondary Persona: Ronnel Diaz, Barangay Disaster Desk Officer"),
  body("**Age and role:** 45, a barangay disaster risk reduction officer in Marikina."),
  body(
    "**Context:** During a flood he is at a desk with a laptop and a phone, fielding calls and messages from residents while coordinating a small number of volunteers with one truck. He is not a dispatcher for the city; he escalates, and he decides who among his neighbours gets attention first.",
  ),
  body(
    "**Technical profile:** Comfortable with a browser and a spreadsheet. No training in any specialist system, and no time to learn one during an event.",
  ),
  body("**Primary pain points:**"),
  bullet(
    "Reports arrive by text message, phone call and Facebook comment, in no order, with no way to tell which describe the same incident.",
  ),
  bullet(
    "He has no basis for judging whether a report is credible. A message claiming chest-deep water may be accurate, exaggerated, or from someone who is not there at all.",
  ),
  bullet(
    "He cannot easily reach a person back once their message arrives, because a Facebook comment carries no phone number.",
  ),
  bullet(
    "He is accountable for his decisions afterwards and has no record of what he saw or when he saw it.",
  ),
  body(
    "**Contextual frustration:** Eleven messages arrive within four minutes. Three may describe the same street. He must choose which to act on with no information beyond the words themselves, knowing that being wrong means somebody waits longer than they should have.",
  ),
  body(
    "**What the system gives him:** a queue scoped to his own barangay, each signal carrying a trust score with its supporting evidence stated in plain language, a call button where the sender left a number, directions to the exact coordinate, and an audit record of every signal he opened. What it deliberately does not give him is an instruction; the decision remains his.",
  ),

  h3("1.5.3 The Contribution Asymmetry"),
  body(
    "A crowdsourced system has a structural problem that neither persona expresses on their own: almost everybody reads and almost nobody contributes. Maricel will open the map far more often than she will file a report, and the map is worthless to her unless somebody else has filed one recently.",
  ),
  body(
    "Three decisions follow from this, and they are why the interface looks as it does. Reporting is the raised centre action in the tab bar rather than a peer item, because it is the one contribution the system asks for and it must not be buried. The report itself is a single tap on a five-level scale, with the photograph optional, because every additional field costs contributions at exactly the moment people are least willing to give them. And the freshness control on an existing report exists because confirming somebody else's reading is a far smaller ask than filing a new one, yet it produces most of the value: it tells the next reader whether a pin is still true.",
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
    "APA 7th edition, alphabetical by author surname. Every entry must be dated 2022 or later, and every entry must correspond to a citation used in the text. Delete any slot you do not fill. Author names, years, volume and issue numbers are left blank deliberately rather than guessed: a reference invented to complete a template is checkable, and is the single worst error this paper could contain.",
  ),
  h3("Journal articles and conference papers"),
  body("____________ (20__). ____________. ____________, __(_), ___-___."),
  body("____________ (20__). ____________. ____________, __(_), ___-___."),
  body("____________ (20__). ____________. ____________, __(_), ___-___."),
  body("____________ (20__). ____________. ____________, __(_), ___-___."),
  note(
    "Fill from the search briefs in Section 1.2. Format: Surname, A. A., & Surname, B. B. (Year). Title of the article in sentence case. Journal Name in Title Case, volume(issue), page-page. https://doi.org/...",
  ),
  h3("Government and institutional sources"),
  body(
    "National Disaster Risk Reduction and Management Council. (20__). ____________. Retrieved ____________, from ____________",
  ),
  body(
    "Philippine Atmospheric, Geophysical and Astronomical Services Administration. (20__). ____________. Retrieved ____________, from ____________",
  ),
  note(
    "These two are the safest entries to complete. Both are primary sources, both are inherently within the date window, and both are trivially verifiable by whoever marks this. Format for a web document: Organisation. (Year). Title of the document in sentence case. Retrieved Month Day, Year, from URL",
  ),
  h3("Platform and industry sources"),
  body("____________ (20__). ____________. ____________"),
  note(
    "Optional. If you cite PetaBencana.id, cite a 2022-or-later publication or evaluation of it rather than the platform's founding material, which falls outside the window.",
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
