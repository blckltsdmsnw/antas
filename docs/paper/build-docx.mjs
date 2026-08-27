import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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

  // A state machine rather than a single split: ** and * toggle independently,
  // so a bold reference line can carry an italic journal title inside it. The
  // paragraph-level `italic` option is the starting state, which lets note()
  // still come out italic throughout.
  let bold = false;
  let ital = italic;
  const out = [];

  for (const part of text.split(/(\*\*|\*)/g)) {
    if (part === "**") {
      bold = !bold;
      continue;
    }
    if (part === "*") {
      ital = !ital;
      continue;
    }
    if (part === "") continue;

    const props =
      `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>` +
      `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` +
      (bold ? "<w:b/>" : "") +
      (ital ? "<w:i/>" : "");
    // xml:space preserve, or Word eats the spaces around emphasised spans.
    out.push(`<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(part)}</w:t></w:r>`);
  }

  return out.join("");
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

/**
 * Figure images, rendered from the mermaid sources in figures/*.mmd.
 *
 * Scaled to the printable width - Letter minus 1in margins each side - and the
 * height derived from each image's own pixel ratio so nothing is stretched.
 * EMU: 914400 per inch.
 */
const FIG_DIR = join(OUT_DIR, "figures");
const PRINT_WIDTH_EMU = Math.round(6.5 * 914400);

/** PNG intrinsic size, read from the IHDR chunk. No image library needed. */
function pngSize(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${path}`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const figures = [1, 2, 3, 4].map((n) => {
  const file = join(FIG_DIR, `fig${n}.png`);
  const { w, h } = pngSize(file);
  return {
    n,
    file,
    rid: `rId${100 + n}`,
    cx: PRINT_WIDTH_EMU,
    cy: Math.round((PRINT_WIDTH_EMU * h) / w),
  };
});

/** An inline image run, wrapped in its own centred paragraph. */
function figureImage(f) {
  const drawing =
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${f.cx}" cy="${f.cy}"/>` +
    `<wp:docPr id="${f.n}" name="Figure ${f.n}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${f.n}" name="fig${f.n}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${f.rid}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${f.cx}" cy="${f.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;

  return (
    `<w:p><w:pPr>` +
    `<w:spacing w:before="240" w:after="80" w:line="276" w:lineRule="auto"/>` +
    `<w:jc w:val="center"/></w:pPr>` +
    `<w:r>${drawing}</w:r></w:p>`
  );
}

/** A figure: the rendered diagram, then its numbered caption. */
function figure(n, caption) {
  return (
    figureImage(figures[n - 1]) +
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
  title("Antas: A Street-Level Flood Depth Reporting System"),
  title("for"),
  title("Metro Manila"),
  centred("Gerald Elijah Olores"),
  centred("Centro Escolar University"),
  centred("Empirical Software Innovation"),
  centred("and"),
  centred("Interface Prototyping"),
  centred("Research Adviser"),
  centred("Dr. Eliza B. Ayo"),
  centred("2026"),
  para("", { before: 200, after: 0 }),

  // === SECTION I ===========================================================
  h1("Section I: Research Foundation"),

  h2("1.1 Problem Statement"),
  body(
    "During a flood, the question a Metro Manila resident actually needs answered is narrow and local: is the water on my street passable right now? Every information source available to them answers a different question.",
  ),
  body(
    "Official warnings operate at the scale of a river basin or a city. They are authoritative about rainfall and river level, and silent about the two hundred metres between a person and the main road. A resident who knows the Marikina River is at second alarm still does not know whether the corner of their own street is ankle-deep or waist-deep. PAGASA issues its flood products by river basin: its national flood picture resolves to a table of eighteen major river basins, in which the capital region appears as the entry NCR/Pasig Marikina Laguna de Bay. Its bulletins are graded on river discharge crossing Alert, Alarm and Critical water levels within a flood warning zone, and are disseminated to local, municipal, and provincial government offices (PAGASA, n.d.).",
  ),
  body(
    "The gap is filled informally, by neighbours posting photographs and short messages to Facebook groups and Messenger threads. That channel is fast, local, and genuinely useful, and it fails in three specific ways. First, it is unstructured: a post saying baha na dito cannot be compared, sorted, or aged, and two posts an hour apart cannot be told apart for currency. Second, it is not addressable by location, because a post attaches to a group rather than to a coordinate, so a reader cannot ask what is happening on their own street. Third, it carries no notion of staleness: a photograph taken three hours ago looks exactly like one taken three minutes ago, and floodwater moves in far less than three hours.",
  ),
  body(
    "The consequence is a decision made on bad information. A resident either waits longer than necessary, or walks into water deeper than they expected. Six inches of moving water is enough to knock an adult off their feet, and floodwater can be electrically charged by downed or underground power lines (National Weather Service, n.d.). The cost of the missing information is not inconvenience; it is a person stepping into a street they believed was passable. The scale of the exposure is not marginal. In the combined effects of the Southwest Monsoon and Tropical Cyclones Butchoy and Carina in July 2024, the NDRRMC recorded 189,771 families, or 754,446 persons, affected in the National Capital Region alone, of whom 584,867 were served outside evacuation centres (NDRRMC, 2024).",
  ),
  body(
    "Platforms built on resident reporting are already documented as viable at city scale. Esparza et al. (2024) show that crowdsourced flood reports improve inundation monitoring of road networks precisely in the blind spots where no flood gauge exists, reducing the number of physical sensors required by 32 per cent. Chow et al. (2023) report that volunteers marking flooded street segments across the Houston metropolitan area produced 399 to 479 data points per day, of which 85.9 per cent fell within one metre of a calibrated hydraulic model. Chow et al. describe their study as a preliminary assessment and recommend caution in interpreting the volunteered data against a hydraulic model, so it is cited here as evidence of collection at scale rather than as an endorsement of accuracy. In that platform volunteers marked street segments as flooded without recording a depth, which the researchers reconstructed afterwards from an elevation model. Antas instead asks the contributor for the depth directly, on a fixed five-level scale, trading reach for comparability between reports. Residents in Metro Manila already have the channel habit this depends on: Facebook reaches 81.9 per cent of the population and Messenger 56.2 per cent (Kemp, 2025).",
  ),
  body(
    "There is a clear need for a tool that collects what residents already report informally, but does so in a structured, located, and time-stamped form, and that is honest about the limits of what it knows. This is the gap Antas aims to fill.",
  ),

  h2("1.2 Related Literature and Studies"),
  body(
    "The literature relevant to Antas falls into five areas: the recent record of crowdsourced disaster reporting platforms, the problem of trusting citizen-contributed data, the Philippine flood and warning context, the design of interfaces used under stress, and the handling of information that decays with time. Each entry states what the source establishes and which decision in this system it supports.",
  ),

  h3("A. Crowdsourced and Participatory Disaster Reporting"),
  body(
    "**Esparza, M., Farahmand, H., Liu, X., & Mostafav, A. (2024). Enhancing inundation monitoring of road networks using crowdsourced flood reports. *Urban Informatics, 3*(1), Article 25. https://doi.org/10.1007/s44212-024-00055-7**",
  ),
  body(
    "Esparza et al. supply the empirical warrant for the premise of this project. Studying the Houston road network, they find that resident-submitted reports improve inundation monitoring precisely where no gauge exists, reducing the number of physical sensors required by 32 per cent. The finding matters because a person standing in floodwater is an instrument no rain gauge can replace: the gauge measures rainfall, the resident measures the street.",
  ),

  body(
    "**Chow, T. E., Chien, J., & Meitzen, K. (2023). Validating the quality of volunteered geographic information (VGI) for flood modeling of Hurricane Harvey in Houston, Texas. *Hydrology, 10*(5), Article 113. https://doi.org/10.3390/hydrology10050113**",
  ),
  body(
    "Chow et al. address the question Esparza et al. leave open, which is whether volunteered readings are accurate rather than merely plentiful. Volunteers marking flooded street segments across the Houston metropolitan area produced between 399 and 479 data points a day, and 85.9 per cent of those segments fell within one metre of a calibrated hydraulic model. The authors are careful about what this shows: they call the study a preliminary assessment and recommend caution in interpreting volunteered data against a model, so it is cited here for collection at scale rather than as a warrant for accuracy. One detail bears directly on the design of Antas. Their volunteers marked segments as flooded without recording a depth, which the researchers reconstructed afterwards from an elevation model; Antas asks the contributor for the depth directly, on a fixed five-level scale, trading reach for comparability between reports.",
  ),

  body(
    "**Feng, Y., Brenner, C., & Sester, M. (2020). Flood severity mapping from volunteered geographic information by interpreting water level from images containing people: A case study of Hurricane Harvey. *ISPRS Journal of Photogrammetry and Remote Sensing, 169*, 301-319. https://doi.org/10.1016/j.isprsjprs.2020.09.011**",
  ),
  body(
    "Feng et al. provide the precedent for reading flood depth against a human body. They estimate water level from photographs containing people, banding the result as ankle, knee, hip or chest. That establishes the body as a workable reference object for depth, which is the premise of the five-level scale used here. Two differences are worth stating rather than glossing. Their bands are applied by annotators to photographs, whereas Antas asks the person standing in the water; and their scale has four levels where this one has five, the above-head level having no counterpart in their work. This source also falls outside the 2022 window applied elsewhere in this review; it is included because the recent literature using body-referenced depth bands cites it as the origin.",
  ),

  body(
    "**Nielsen, A. B., Landwehr, D., Nicolai, J., Patil, T., & Raju, E. (2024). Social media and crowdsourcing in disaster risk management: Trends, gaps, and insights from the current state of research. *Risk, Hazards & Crisis in Public Policy, 15*(2), 104-127. https://doi.org/10.1002/rhc3.12297**",
  ),
  body(
    "Nielsen et al. review 237 studies published between 2008 and 2023 on social media and crowdsourcing in disaster risk management, establishing that public information sharing during disasters is a documented and studied phenomenon rather than an assumption of this project. This justifies the product's basic shape: residents already post flood photographs to Facebook groups, and the contribution of Antas is structure, location and time, not the impulse to share.",
  ),

  body(
    "**Cicek, D., & Kantarci, B. (2023). Use of mobile crowdsensing in disaster management: A systematic review, challenges, and open issues. *Sensors, 23*(3), Article 1699. https://doi.org/10.3390/s23031699**",
  ),
  body(
    "Cicek and Kantarci draw a distinction between crowdsourcing, which they characterise as gathering unstructured crowd intelligence through social media, and crowdsensing, a more structured type of data generation by crowds. Antas sits on the structured side of that line by design. The review also names a crowd-as-reporters pattern in which a member of the public submits an observation that is then checked, which is the shape of the moderator queue in Section 2.4. Note the scope limit: this review deliberately excludes work scoped solely to social media, so it is cited for the structured-versus-unstructured distinction and not as evidence about informal sharing behaviour.",
  ),

  h3("B. Trust, Verification and Data Quality"),
  body(
    "**Lowrie, C., Kruczkiewicz, A., McClain, S. N., Nielsen, M., & Mason, S. J. (2022). Evaluating the usefulness of VGI from Waze for the reporting of flash floods. *Scientific Reports, 12*(1), Article 5268. https://doi.org/10.1038/s41598-022-08751-7**",
  ),
  body(
    "This source addresses how the reliability of an unverified report from an unknown person can be estimated. Lowrie et al. establish two of the three signals the Antas trust score relies on: clustering of reports relative to authoritative sources, and a per-contributor credibility score. They are explicit that they did not test the third, stating that their research has not included digital elevation models, atmospheric data, or streamflow gauges, all of which would be valuable additions. The environmental-corroboration group in Section 2.4 therefore rests on Safaei-Moghadam et al. rather than on this source, and the distinction is stated here rather than blurred.",
  ),

  body(
    "**Safaei-Moghadam, A., Tarboton, D., & Minsker, B. (2023). Estimating the likelihood of roadway pluvial flood based on crowdsourced traffic data and depression-based DEM analysis. *Natural Hazards and Earth System Sciences, 23*(1), 1-19. https://doi.org/10.5194/nhess-23-1-2023**",
  ),
  body(
    "Safaei-Moghadam et al. supply the environmental half of the trust score. They note that the Waze app has no pre-qualification for users to post a report, and consequently not all flood-labelled alerts are reliable as flood observations. Their response is to require a cluster of more than two flood alerts near a mapped depression, and to cross-check alert timing against rainfall and alert location against elevation data. Those are precisely the corroboration, rainfall and elevation groups in Section 2.4.",
  ),
  body(
    "**Gheyas, I., Asghar, M. R., Schneider, S., & Woodward, A. (2025). *Establishing trust in crowdsourced data* (arXiv:2511.03016). arXiv. https://arxiv.org/abs/2511.03016**",
  ),
  body(
    "Gheyas et al. show that a contributor-reputation mechanism can weight submissions without excluding contributors, filtering guesses while prioritising consistent contributors. This supports two decisions at once: the reputation record of confirmed and false reports, and the rule that a low-confidence emergency signal is ranked lower but never filtered out. This is a preprint and has not been peer reviewed, which is stated here rather than left for a reader to discover.",
  ),

  body(
    "**Hilberts, S., Govers, M., Petelos, E., & Evers, S. (2025). The impact of misinformation on social media in the context of natural disasters: Narrative review. *JMIR Infodemiology, 5*, Article e70413. https://doi.org/10.2196/70413**",
  ),
  body(
    "Hilberts et al. establish that false or outdated information spreads readily during an emergency, and that corrections travel more slowly than the claims they correct. This supports two refusals recorded in Section 4.2: free-text comments beneath a depth reading, and any label describing floodwater as safe. In a system nobody moderates, a reassuring comment outlives the conditions that produced it.",
  ),

  h3("C. The Philippine Flood Context"),
  body(
    "**Philippine Atmospheric, Geophysical and Astronomical Services Administration. (n.d.). *Flood information*. Retrieved August 15, 2026, from https://www.pagasa.dost.gov.ph/flood**",
  ),
  body(
    "This is the primary source for the spatial unit at which official warnings are issued. PAGASA organises its flood products around eighteen major river basins and disseminates them to local, municipal, and provincial government offices. The finest spatial unit reached by any public PAGASA product examined here is the city or municipality: its regional forecast names conditions over Metro Manila and then lists constituent cities, the whole of Marikina appearing as one unit. That is the primary-source basis for the central claim of the problem statement, stated as a demonstrated coarse granularity rather than as a denial that any street-level product exists. Antas does not compete with these warnings; it answers the question they are not designed to answer.",
  ),

  body(
    "**Philippine Atmospheric, Geophysical and Astronomical Services Administration. (n.d.). *Legend*. Retrieved August 15, 2026, from https://pagasa.dost.gov.ph/learnings/legend**",
  ),
  body(
    "This page carries the published definitions of the colour-coded rainfall warnings, and states the spatial unit explicitly: the General Flood Advisory is issued for non-telemetered river basins and issued to the public on a regional basis. The impact language is spatially generic in the same way, warning that flooding is possible in low-lying areas and near river channels, which names a category of place rather than a place. Note that this page carries no publication date; the date given is a retrieval date.",
  ),

  body(
    "**National Disaster Risk Reduction and Management Council. (2024). *SitRep no. 46 for the combined effects of Southwest Monsoon and TCs Butchoy and Carina (2024)*. Retrieved August 15, 2026, from https://ndrrmc.gov.ph/attachments/article/4259/SitRep_No_46_for_the_Combined_Effects_of_Southwest_Monsoon_and_TCs_BUTCHOY_and_CARINA_2024.pdf**",
  ),
  body(
    "SitRep No. 46 is the final report in its series, so its figures are post-validation. It records 189,771 families, or 754,446 persons, affected in the National Capital Region, of whom 584,867 were served outside evacuation centres. That is the scale statistic the problem statement rests on, taken from the primary record rather than from a news summary of it. The report number and date matter: the National Capital Region count rose from 125,491 persons in SitRep No. 17 on 26 July to 754,446 in SitRep No. 46 a month later, so an earlier report in the same series would understate the event several times over.",
  ),

  body(
    "**World Bank. (2020). *Concept project information document (PID): Pasig-Marikina River Basin Flood Management Project (P171897)* (Report No. PIDC27692). World Bank Group. https://documents.worldbank.org/curated/en/851731580982488098/pdf/Concept-Project-Information-Document-PID-Pasig-Marikina-River-Basin-Flood-Management-Project-P171897.pdf**",
  ),
  body(
    "The World Bank's project assessment establishes that flooding in the Pasig-Marikina basin is a chronic structural condition rather than a sequence of exceptional events: parts of the basin flood already during rainfall events with a five-year return period. The NDRRMC situational report supplies the scale of one severe event; this supplies the recurrence that makes a standing tool worth building rather than an emergency broadcast.",
  ),

  h3("D. Interface Design for Use Under Stress"),
  body(
    "**Knysh, A., & Pohrebniak, T. (2026). Mental health app crisis support assessment framework: Development and pilot testing. *Frontiers in Digital Health, 8*, Article 1814547. https://doi.org/10.3389/fdgth.2026.1814547**",
  ),
  body(
    "This source establishes that attention narrows in a crisis, and that every additional step in a path raises the chance the task is abandoned. Knysh and Pohrebniak find that each additional navigation tap or ambiguous label increases the risk that a user abandons the task entirely, and criticise crisis interfaces built from pale, small, hierarchy-free text. Two decisions rest on this: the emergency control is a plainly labelled tab rather than a long-press on the ordinary report button, and depth is expressed in body parts so that no arithmetic conversion is required. The limit of this warrant should be stated. The older claim that stress makes people revert to habitual actions is not asserted here, because recent primary work fails to replicate that effect; the argument rests on interaction cost under narrowed attention instead. The source lists adequate touch targets as a criterion but gives no numeric value and does not address outdoor viewing, so the 48-pixel target rests on the WCAG 2.2 recommendation below rather than on this source. The light-only interface is not derived from either source: it is a design judgement about reading a screen outdoors in daylight, and is recorded here as a judgement rather than dressed as a standard.",
  ),

  body(
    "**World Wide Web Consortium. (2024). *Web Content Accessibility Guidelines (WCAG) 2.2* (W3C Recommendation). Retrieved August 15, 2026, from https://www.w3.org/TR/WCAG22/**",
  ),
  body(
    "WCAG 2.2 sets the published minimum target size. Success criterion 2.5.8, at Level AA, sets a minimum of 24 by 24 CSS pixels; the enhanced criterion 2.5.5, at Level AAA, sets 44 by 44. The 48-pixel minimum used here exceeds both. It is stated that way deliberately: WCAG does not require 48 pixels, and a paper that implied it did would be misreporting the standard it claims to follow.",
  ),

  h3("E. Information Decay and Offline Operation"),
  body(
    "**Liu, B., Wang, Y., & Li, Y. (2024). The effect of time display format on cognitive performance of integrated meteorological radar information. *Behavioral Sciences, 14*(9), Article 847. https://doi.org/10.3390/bs14090847**",
  ),
  body(
    "Liu et al. establish that how the age of a time-sensitive reading is displayed changes whether people account for it. They study pilots reading radar imagery and find that users overlook the latency or underestimate the uncertainty the delay introduces, and that the display format of the delay affects this. Two limits should be stated rather than glossed. Their population is pilots reading cockpit radar, not the general public, so the transfer to a flood map is an argument this paper makes and not a finding the source reports. And they manipulate the format of an already-shown delay rather than testing age-marking against its absence, so they support the decision to state a reading's age prominently, not the stronger claim that usefulness decays at a measurable rate. The six-hour cutoff in particular has no source: no work found within the review window fixes a threshold, and it is an engineering judgement of this project. Ashista et al. and the MDN documentation below cover the separate decision to cache the application shell and the guide for use without a network.",
  ),

  body(
    "**Ashista, H., Comas, A. S., Selby, T., Essar, M. Y., Alawa, J., Al-Hajj, S., & Nelson, E. (2026). An offline-first electronic health record for vulnerable populations: A mixed-methods feasibility study. *PLOS Digital Health, 5*(2), Article e0001204. https://doi.org/10.1371/journal.pdig.0001204**",
  ),
  body(
    "Ashista et al. demonstrate that an offline-first architecture with deferred synchronisation is workable for a safety-relevant application under intermittent connectivity in a low-resource setting. Liu et al. cover how the age of a reading is displayed; this covers the other half, the decision to cache the application shell and the preparedness guide so the product still opens when the network does not.",
  ),
  body(
    "**Mozilla. (2025). *Offline and background operation*. MDN Web Docs. Retrieved August 15, 2026, from https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation**",
  ),
  body(
    "MDN documents the service-worker mechanism by which a progressive web application serves cached content without a network, which is the implementation route for the cached shell and guide described above.",
  ),

  h3("F. The Closest Comparable System"),
  body(
    "**Roque, N. (2024, August 24). Dingdong Dantes’ foundation helps launch LyfSaver, an app to foster bayanihan during disasters. *GMA Integrated News*. https://www.gmanetwork.com/news/lifestyle/content/918113/dingdong-dantes-foundation-helps-launch-lyfsaver-an-app-to-foster-bayanihan-during-disasters/story/**",
  ),
  body(
    "LyfSaver is the system this project most resembles, and the comparison is worth making directly rather than leaving implied. Launched in August 2024 by Fyt Media with the University of the Philippines Nationwide Operational Assessment of Hazards, the UP Resilience Institute and the YesPinoy Foundation, it accepts resident reports of floods, storm surges, landslides, barangay status and accidents, with photographs, video and messages, and combines them with UP-NOAH hazard mapping and a volunteer training programme. It is available as a mobile application and in the browser at https://app.lyfsaver.ph.",
  ),
  body(
    "It is better resourced than this project in every dimension that resources buy: scientific hazard layers, institutional partners, and a training pipeline. Its adoption is real rather than prospective.",
  ),
  body(
    "**Magbanua, S. A. (2026, August 26). QC trains city disaster responders through LyfSaver. *Daily Tribune*. https://tribune.net.ph/2026/08/26/qc-trains-city-disaster-responders-through-lyfsaver**",
  ),
  body(
    "Magbanua reports the Quezon City government training barangay officials, volunteers and city disaster responders on the platform, describing it as a tool to report incidents, verify information and share trusted updates during emergencies. The significance for this project is twofold. It confirms that the problem addressed here is real enough for a city government to invest in, and it establishes that the crowdsourced-reporting space in Metro Manila is occupied. Any claim this project makes to contribute something must therefore be a claim about what LyfSaver does not do, not about the category as a whole.",
  ),
  body(
    "That difference is one of data type. LyfSaver records that an incident is present at a place. Antas records how deep the water is, on a fixed five-level scale, which is a different kind of measurement: it can be ordered, compared between reports, clustered, and turned into a decision. A report that a street is flooded cannot be converted into advice; a report that the water is knee-deep can. Section 1.3 argues that difference and Section 1.4 tabulates it, including the rows where LyfSaver is the stronger system.",
  ),

  h3("G. The Official Passability Standard"),
  body(
    "**Malasig, J. (2024, September 4). Tire deep or gutter deep? MMDA’s new system assigns acronyms to flood levels. *Interaksyon*. https://interaksyon.philstar.com/trends-spotlights/2024/09/04/282826/mmda-flood-gauge-system-travelers-motorists/**",
  ),
  body(
    "Malasig documents the Metropolitan Manila Development Authority’s Flood Gauge System, which classifies a flooded road by whether vehicles can pass it: PATV, passable to all types of vehicles, at eight to ten inches; NPLV, not passable to light vehicles, at thirteen to nineteen inches; and NPATV, not passable to any type of vehicle, at twenty-six inches and above. The system is the reason this project can make a passability claim without inventing a threshold.",
  ),
  body(
    "Two features of the standard matter here. The first is that it is official and published, so adopting it is citation rather than invention — an important distinction for a safety claim. The second is that MMDA describes its own categories in body terms: nineteen inches is “knee deep”, thirty-seven is “waist deep”, forty-five is “chest deep”. The scale this project chose for its own reasons, described in Section 2.2, turns out to be the vocabulary the national road authority already uses. Antas maps its five levels onto the three MMDA categories, taking the worse category wherever one of its bands straddles two, and shows the result on every flood report.",
  ),

  h3("Synthesis: The Gap This Project Addresses"),
  body(
    "Taken together the literature supports three positions, with the strength of each stated honestly. First, residents are a documented source of hazard information that instruments do not capture at street level: Esparza et al. quantify a 32 per cent reduction in the sensors required, and Chow et al. show collection at a rate of several hundred street segments a day, though they caution against treating volunteered depth as accurate. Second, trust is the recurring difficulty in this literature rather than collection, and the responses described are to weigh reports by corroboration, contributor history and independent environmental data. That weighting is documented in individual systems; describing it as the field's settled answer would go further than the sources reviewed here allow. Third, official warning systems are authoritative and necessary, and work at a spatial resolution that cannot answer the question a person standing on a street is asking, which PAGASA's own products demonstrate directly.",
  ),
  body(
    "Where this project positions its contribution is the treatment of information decay in the interface itself. The sources reviewed here concentrate on collecting reports and on judging their reliability; none of them examines withholding a report once it is too old to act on. That is an observation about the literature this review reached, not a demonstrated gap in the field, and it is stated as such: a systematic search would be needed to establish that no such work exists. On that reading, Antas treats staleness as a first-class safety property: every reading states its age, and beyond six hours the map draws nothing and says why. It pairs that with an explicit refusal to imply a dispatch capability it does not have. Those two commitments, rather than the collection mechanism, are what distinguish this system from the precedents reviewed here.",
  ),
  h2("1.3 How Antas Improves Upon Existing Solutions"),
  body(
    "Two comparisons are needed rather than one. The tools a Metro Manila resident reaches for during a flood — official warnings, news, neighbourhood groups, navigation apps — differ from Antas in the ways set out below. LyfSaver, described in Section 1.2F, is a different case: it is a purpose-built crowdsourced reporting platform and shares this project’s premise. The differences that matter against it are the third, the seventh and the eighth.",
  ),
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
    "**Every reading carries its age.** A pin states how old it is, and past six hours the map refuses to draw the data at all rather than presenting a stale reading as current. A photograph posted to a group carries no such treatment: nothing in the channel marks its age or withdraws it once conditions change.",
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
  numbered(
    7,
    "**A measurement, not a report.** This is the difference that separates Antas from other crowdsourced platforms rather than from informal sources. A platform records that an incident is present at a place; Antas records how deep the water is on a five-level scale. The distinction is not one of detail but of data type. A presence report cannot be ordered, compared between contributors, or clustered without losing its meaning, and it cannot be converted into advice. A graded reading can be all four, which is what makes the map colour-ramp, the cluster rule that takes the deepest member, and the passability classification below possible at all.",
  ),
  numbered(
    8,
    "**Road passability in the national authority’s own words.** Antas maps each flood reading onto the MMDA Flood Gauge System (Section 1.2G) and shows the result: passable to all vehicles, not passable to light vehicles, or not passable to any vehicle. MMDA publishes that classification for a small number of monitored roads; Antas publishes it for any street a resident is standing on, minutes old, in the vocabulary Metro Manila motorists already read in traffic advisories. Where one of the five levels straddles two MMDA categories the worse category is taken, so the system never reports a street as more passable than the reading supports. It offers no verdict for people on foot, because the MMDA standard covers vehicles and moving water is dangerous well below knee height; the interface says so rather than estimating.",
  ),
  body(
    "The seventh and eighth points are the substantive claim of this project. The first six distinguish Antas from informal sources, which is a low bar. Against a purpose-built platform the argument is narrower and should be stated as such: Antas does not attempt the breadth of a multi-hazard information platform, and would lose that comparison. It contributes one measurement those platforms do not take, and one decision they therefore cannot support.",
  ),

  h2("1.4 Functionality Comparison"),
  body(
    "The table compares Antas with the sources a Metro Manila resident currently relies on during a flood, and with LyfSaver, the purpose-built platform described in Section 1.2F. LyfSaver is given its own column because it is the only entry that shares this project’s premise, and the rows where it is the stronger system are marked as such.",
  ),
  table(
    [2400, 1120, 1120, 1120, 1120, 1320, 1120],
    [
      ["Function", "PAGASA", "News", "FB groups", "Waze", "LyfSaver", "Antas"],
      ["Street-level incident reports", "❌", "❌", "△", "✅", "✅", "✅"],
      ["Graded water depth, not just presence", "❌", "❌", "△", "❌", "❌", "✅"],
      ["Structured, comparable readings", "✅", "❌", "❌", "△", "△", "✅"],
      ["Road passability in MMDA categories", "❌", "△", "❌", "△", "❌", "✅"],
      ["States the age of each reading", "✅", "❌", "❌", "△", "△", "✅"],
      ["Refuses to show stale data", "❌", "❌", "❌", "❌", "❌", "✅"],
      ["Confirmation that a report still holds", "❌", "❌", "△", "✅", "△", "✅"],
      ["Works with no connection", "❌", "❌", "❌", "❌", "△", "✅"],
      ["Filipino-first interface", "△", "✅", "✅", "△", "✅", "✅"],
      ["Withholds a person’s emergency from the public map", "—", "❌", "❌", "—", "❌", "✅"],
      ["States plainly that it cannot dispatch", "❌", "❌", "❌", "❌", "❌", "✅"],
      ["Multi-hazard coverage beyond flood", "△", "✅", "✅", "△", "✅", "✅"],
      ["Scientific hazard and risk layers", "✅", "❌", "❌", "❌", "✅", "❌"],
      ["Verified alerts from an institution", "✅", "✅", "❌", "❌", "✅", "❌"],
      ["Photographs and video with a report", "❌", "✅", "✅", "△", "✅", "△"],
      ["Responder training programme", "✅", "❌", "❌", "❌", "✅", "❌"],
      ["Deployed with a city government", "✅", "—", "❌", "—", "✅", "❌"],
    ],
  ),
  note("Legend: ✅ provided, △ partial or incidental, ❌ not provided, — not applicable."),
  note(
    "The last five rows are the ones LyfSaver wins, and they are included deliberately. A comparison table in which the author’s own system takes every row is an advertisement rather than an assessment. LyfSaver carries UP-NOAH hazard modelling, institutional verification, a training pipeline and a live deployment with the Quezon City government; this project has none of those and is not attempting them. Photographs are marked partial for Antas because a photograph may be attached to a report but video cannot, and because photographs of accident and medical incidents are withheld from the public map by the same rule that withholds their location.",
  ),
  note(
    "Three cells warrant a note. Public Facebook groups are readable without an account and private ones are not, so the account row of the earlier draft was partial rather than absent for that column. Waze hazard reports are a fixed set of named categories rather than graded readings, which is why its structured-readings cell is partial. LyfSaver’s offline behaviour is marked partial rather than absent because it is available as an installable mobile application, which implies some local caching, but no published statement of its offline guarantees was found; the cell records what could be verified, not what is likely.",
  ),

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
  body("The application is structured around eight interactive features."),
  numbered(
    1,
    "**Depth Map.** The default screen. Reports are drawn as pins coloured along a five-step depth ramp, clustered when they overlap. A cluster takes the depth of its deepest member rather than an average, so eleven ankle-deep reports cannot hide one above-head report behind a reassuring colour.",
  ),
  numbered(
    2,
    "**Report Flow.** A five-level gauge labelled by body part, with an optional photograph and an automatic GPS accuracy check. Where the fix is imprecise the user is warned and asked to confirm, because a report placed on the wrong street is worse than no report. The photograph is taken through an in-page viewfinder rather than chosen from the device’s files: a picker offers the gallery beside the camera, which places an image downloaded from anywhere one tap away from a report about a specific street.",
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
    "**Moderator Console.** Two triage queues on one screen, both scoped to a barangay. The emergency queue shows each signal’s trust score, its supporting evidence, a call button, and directions. The report queue, described in 2.6, carries the depth readings themselves. Each tab shows its own count, so a backlog building behind the queue in view is visible without going to look for it, and every opening of either kind of row is recorded.",
  ),
  numbered(
    6,
    "**Preparedness Guide (Gabay).** Hotline numbers first, then a packing checklist and advice for before and during a flood. Cached for offline use, because this is the page most likely to be read with no connection.",
  ),
  numbered(
    7,
    "**Language Toggle.** The whole interface in Filipino or English, with no partial translation, resolved on the server so no screen is ever briefly in the wrong language.",
  ),
  numbered(
    8,
    "**Report Dashboard.** The second queue in the console, listing submitted depth readings in priority order with the reporter’s contact number available on the report a moderator opens. Added in response to the review described in 2.6.",
  ),

  h2("2.3 System Architecture"),
  body(
    "The client is built on the Next.js App Router, using server components for content and client components for the map and interactive controls. Data lives in Supabase: PostgreSQL with geospatial queries, Row Level Security, Storage for photographs, and Realtime for live queue updates. The map is MapLibre GL over CARTO basemaps, switching between day and night styling according to Manila clock time. Rainfall and elevation come from Open-Meteo and feed the trust score.",
  ),
  figure(1, "System architecture. Every path to data passes through Row Level Security."),
  body(
    "The system comprises ten tables across twenty-seven migrations, and twenty-two database functions. Security is enforced in PostgreSQL rather than in application code: a moderator's barangay scope, the confidentiality of a reporter's phone number, and the visibility of emergency photographs are all database predicates, so no route can bypass them by accident, including a route added later by somebody who has not read this report.",
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

  h2("2.6 Response to Review Recommendations"),
  body(
    "The working system was reviewed by Mr. Peralta, who returned five recommendations. Four are implemented and described in this report as built behaviour; the fifth is adopted as scope and is deliberately not claimed as working software. They are separated here because a report that describes intentions in the present tense is not a report a reader can check.",
  ),
  table(
    [3400, 1500, 4460],
    [
      ["Recommendation", "Status", "How it was addressed"],
      [
        "Expand the scope beyond flood to emergency, fire, earthquake and accidents",
        "Adopted as scope",
        "Not built. The staging argument and what the change requires are set out below.",
      ],
      [
        "Create a dashboard for the admin to monitor the submitted reports",
        "Implemented",
        "A second queue in the moderator console, scoped to a barangay by the same database predicate as the emergency queue.",
      ],
      [
        "Organise the reports and categorise them to identify priorities",
        "Implemented",
        "Three priority bands computed in the database from severity and age, with contested reports ordered above all of them.",
      ],
      [
        "Use the built-in camera to capture instead of uploading pictures",
        "Implemented",
        "The report screen now uses the same in-page viewfinder the emergency screen has always used.",
      ],
      [
        "Collect additional data such as a contact number, to contact the reporter",
        "Implemented",
        "The column and the field already existed for emergencies; the number is now reachable from a depth report as well.",
      ],
    ],
  ),
  body(
    "**Priority is a stated rule, not a score.** A report is urgent when it is chest-deep or deeper and less than six hours old, watch when it is waist-deep and fresh or deep but older, and routine otherwise. Six hours is not a new threshold: it is the same age at which the map already refuses to draw a cached reading, on the argument that floodwater moves in far less time than that. Contested readings sort above every band regardless of depth, because a contested report is waiting on a person rather than on the water.",
  ),
  body(
    "The deliberate omission is a trust score. Emergency signals carry one because they are weighed against rainfall, elevation and reporter history before a human sees them; a depth reading has no comparable evidence behind it, and a number computed from severity and age alone would present an ordering rule as an assessment. The bands are shown as words for the same reason the console never shows a bare score: a moderator can argue with a sentence.",
  ),
  body(
    "**The contact number was already collected, and the recommendation identified where it was missing.** A reporter’s number has been stored since the emergency work, constrained to a single dialable form, and exposed only through the function that serves a moderator who may act on that signal. What did not exist was any path from a depth report to the person who filed it. That path now exists on the same terms: the number is absent from the queue listing and present on the report a moderator opens, and every opening is recorded, because the record of who saw a number is also the record of who could have called it.",
  ),
  body(
    "One limitation is restated rather than resolved: these numbers are unverified. Verification means sending a code by SMS, which requires a paid provider this project does not have, so the console labels the number as what the reporter typed rather than as a checked fact.",
  ),
  body(
    "**On expanding beyond flood.** The recommendation is accepted as the right direction and is not implemented, and the distance between those two statements is the substance of this response. The system’s data model is not merely flood-themed; it is flood-shaped. Severity is a five-step scale named for where water reaches on a body, the map colours and clusters pins along that scale and takes a cluster’s deepest member so that shallow readings cannot average away a deep one, and the trust score weighs rainfall and elevation. None of that survives contact with a fire. A body-part gauge cannot describe a structural collapse, and rainfall is not evidence about an earthquake.",
  ),
  body(
    "A serious multi-hazard version therefore needs a hazard type carried on every report and signal, a separate severity vocabulary for each hazard, a scoring path per hazard or an honest refusal to score the ones without evidence to weigh, revised map semantics for hazards that are not measured in depth, and every new string written in both Filipino and English, since the product fails its build rather than falling back when a translation is missing. Attempting it inside the remaining scope of this course would produce a system that named four hazards and handled one of them properly, which is a worse answer to the recommendation than a working single-hazard system and a clear statement of what the extension costs.",
  ),
  body(
    "There is also a naming consequence worth recording: **antas** means level, and the product is named for the measurement it takes. A multi-hazard system would need a different organising noun, not merely additional categories.",
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
    "**A Ligtas, or safe, label on ankle-deep water.** No flood depth is safe to declare. Six inches of moving water is enough to knock an adult off their feet, and floodwater can be electrically charged by downed or underground power lines (National Weather Service, n.d.).",
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
  body("**Prototype Link:** https://stitch.withgoogle.com/projects/7108188453245133559"),
  body("**Live Application:** https://antas-one.vercel.app"),
  body("**Source Repository:** https://github.com/blckltsdmsnw/antas"),

  h2("References"),
  h3("Journal articles and conference papers"),
  body(
    "Ashista, H., Comas, A. S., Selby, T., Essar, M. Y., Alawa, J., Al-Hajj, S., & Nelson, E. (2026). An offline-first electronic health record for vulnerable populations: A mixed-methods feasibility study. *PLOS Digital Health, 5*(2), Article e0001204. https://doi.org/10.1371/journal.pdig.0001204",
  ),
  body(
    "Chow, T. E., Chien, J., & Meitzen, K. (2023). Validating the quality of volunteered geographic information (VGI) for flood modeling of Hurricane Harvey in Houston, Texas. *Hydrology, 10*(5), Article 113. https://doi.org/10.3390/hydrology10050113",
  ),
  body(
    "Cicek, D., & Kantarci, B. (2023). Use of mobile crowdsensing in disaster management: A systematic review, challenges, and open issues. *Sensors, 23*(3), Article 1699. https://doi.org/10.3390/s23031699",
  ),
  body(
    "Esparza, M., Farahmand, H., Liu, X., & Mostafav, A. (2024). Enhancing inundation monitoring of road networks using crowdsourced flood reports. *Urban Informatics, 3*(1), Article 25. https://doi.org/10.1007/s44212-024-00055-7",
  ),
  body(
    "Feng, Y., Brenner, C., & Sester, M. (2020). Flood severity mapping from volunteered geographic information by interpreting water level from images containing people: A case study of Hurricane Harvey. *ISPRS Journal of Photogrammetry and Remote Sensing, 169*, 301-319. https://doi.org/10.1016/j.isprsjprs.2020.09.011",
  ),
  body(
    "Gheyas, I., Asghar, M. R., Schneider, S., & Woodward, A. (2025). *Establishing trust in crowdsourced data* (arXiv:2511.03016). arXiv. https://arxiv.org/abs/2511.03016",
  ),
  body(
    "Hilberts, S., Govers, M., Petelos, E., & Evers, S. (2025). The impact of misinformation on social media in the context of natural disasters: Narrative review. *JMIR Infodemiology, 5*, Article e70413. https://doi.org/10.2196/70413",
  ),
  body(
    "Kemp, S. (2025). *Digital 2026: The Philippines*. DataReportal. Retrieved August 15, 2026, from https://datareportal.com/reports/digital-2026-philippines",
  ),
  body(
    "Knysh, A., & Pohrebniak, T. (2026). Mental health app crisis support assessment framework: Development and pilot testing. *Frontiers in Digital Health, 8*, Article 1814547. https://doi.org/10.3389/fdgth.2026.1814547",
  ),
  body(
    "Liu, B., Wang, Y., & Li, Y. (2024). The effect of time display format on cognitive performance of integrated meteorological radar information. *Behavioral Sciences, 14*(9), Article 847. https://doi.org/10.3390/bs14090847",
  ),
  body(
    "Lowrie, C., Kruczkiewicz, A., McClain, S. N., Nielsen, M., & Mason, S. J. (2022). Evaluating the usefulness of VGI from Waze for the reporting of flash floods. *Scientific Reports, 12*(1), Article 5268. https://doi.org/10.1038/s41598-022-08751-7",
  ),
  body(
    "Mozilla. (2025). *Offline and background operation*. MDN Web Docs. Retrieved August 15, 2026, from https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation",
  ),
  body(
    "National Weather Service. (n.d.). *During a flood*. National Oceanic and Atmospheric Administration. Retrieved August 15, 2026, from https://www.weather.gov/safety/flood-during",
  ),
  body(
    "Nielsen, A. B., Landwehr, D., Nicolai, J., Patil, T., & Raju, E. (2024). Social media and crowdsourcing in disaster risk management: Trends, gaps, and insights from the current state of research. *Risk, Hazards & Crisis in Public Policy, 15*(2), 104-127. https://doi.org/10.1002/rhc3.12297",
  ),
  body(
    "Safaei-Moghadam, A., Tarboton, D., & Minsker, B. (2023). Estimating the likelihood of roadway pluvial flood based on crowdsourced traffic data and depression-based DEM analysis. *Natural Hazards and Earth System Sciences, 23*(1), 1-19. https://doi.org/10.5194/nhess-23-1-2023",
  ),
  body(
    "World Bank. (2020). *Concept project information document (PID): Pasig-Marikina River Basin Flood Management Project (P171897)* (Report No. PIDC27692). World Bank Group. https://documents.worldbank.org/curated/en/851731580982488098/pdf/Concept-Project-Information-Document-PID-Pasig-Marikina-River-Basin-Flood-Management-Project-P171897.pdf",
  ),
  body(
    "World Wide Web Consortium. (2024). *Web Content Accessibility Guidelines (WCAG) 2.2* (W3C Recommendation). Retrieved August 15, 2026, from https://www.w3.org/TR/WCAG22/",
  ),

  h3("Government and institutional sources"),
  body(
    "National Disaster Risk Reduction and Management Council. (2024). *SitRep no. 46 for the combined effects of Southwest Monsoon and TCs Butchoy and Carina (2024)*. Retrieved August 15, 2026, from https://ndrrmc.gov.ph/attachments/article/4259/SitRep_No_46_for_the_Combined_Effects_of_Southwest_Monsoon_and_TCs_BUTCHOY_and_CARINA_2024.pdf",
  ),
  body(
    "Philippine Atmospheric, Geophysical and Astronomical Services Administration. (n.d.). *Flood information*. Retrieved August 15, 2026, from https://www.pagasa.dost.gov.ph/flood",
  ),
  body(
    "Philippine Atmospheric, Geophysical and Astronomical Services Administration. (n.d.). *Legend*. Retrieved August 15, 2026, from https://pagasa.dost.gov.ph/learnings/legend",
  ),
  h3("Platform and industry sources"),
  body(
    "Magbanua, S. A. (2026, August 26). QC trains city disaster responders through LyfSaver. *Daily Tribune*. https://tribune.net.ph/2026/08/26/qc-trains-city-disaster-responders-through-lyfsaver",
  ),
  body(
    "Malasig, J. (2024, September 4). Tire deep or gutter deep? MMDA’s new system assigns acronyms to flood levels. *Interaksyon*. https://interaksyon.philstar.com/trends-spotlights/2024/09/04/282826/mmda-flood-gauge-system-travelers-motorists/",
  ),
  body(
    "Roque, N. (2024, August 24). Dingdong Dantes’ foundation helps launch LyfSaver, an app to foster bayanihan during disasters. *GMA Integrated News*. https://www.gmanetwork.com/news/lifestyle/content/918113/dingdong-dantes-foundation-helps-launch-lyfsaver-an-app-to-foster-bayanihan-during-disasters/story/",
  ),
  note(
    "No peer-reviewed study of PetaBencana.id published in 2022 or later could be located; the available literature on that platform predates the date window applied here. The three sources above are news reporting rather than peer-reviewed work, and are cited for what news reporting can establish — that a system exists, when it launched, who built it, and that a city government has adopted it — not for evaluative claims about its performance.",
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
  `<Default Extension="png" ContentType="image/png"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const rels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

// document.xml needs its own relationship part; the r:embed on each image
// resolves through this, not through the package-level _rels/.rels.
const documentRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  figures
    .map(
      (f) =>
        `<Relationship Id="${f.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fig${f.n}.png"/>`,
    )
    .join("") +
  `</Relationships>`;

rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

// Flat files with the archive path chosen explicitly below, so nothing depends
// on how a directory tree happens to be walked.
const parts = [
  ["[Content_Types].xml", contentTypes],
  ["_rels/.rels", rels],
  ["word/document.xml", documentXml],
  ["word/_rels/document.xml.rels", documentRels],
];

parts.forEach(([name, xml], i) => writeFileSync(join(BUILD, `part${i}`), xml));

// Images are copied in as bytes, not text. Writing a PNG through a StreamWriter
// would re-encode it and produce a file Word silently shows as a broken image.
const binaryParts = figures.map((f) => [`word/media/fig${f.n}.png`, f.file]);

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
  ...binaryParts.map(([name, src]) => {
    const s = src.replace(/'/g, "''");
    return (
      `$e = $zip.CreateEntry('${name}'); ` +
      `$st = $e.Open(); ` +
      `$bytes = [System.IO.File]::ReadAllBytes('${s}'); ` +
      `$st.Write($bytes, 0, $bytes.Length); $st.Dispose()`
    );
  }),
  "$zip.Dispose()",
].join("; ");

execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });

rmSync(BUILD, { recursive: true, force: true });
console.log(`Wrote ${outPath}`);
console.log("Times New Roman 12pt - Letter - 1in margins - no first-line indent");
console.log(
  `Four figures embedded from figures/*.png at ${(PRINT_WIDTH_EMU / 914400).toFixed(2)}in wide:`,
);
for (const f of figures) {
  console.log(`  Figure ${f.n}: ${(f.cy / 914400).toFixed(2)}in tall`);
}
