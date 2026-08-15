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
const pageBreak = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

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
  // --- Title block, centred, matching the reference's front matter ---------
  title("Antas: Street-Level Flood Depth Reporting for Metro Manila"),
  centred("Elijah Olores"),
  centred("Centro Escolar University"),
  centred("Empirical Software Innovation and Interface Prototyping"),
  centred("2026"),
  para("", { before: 240, after: 0 }),

  // --- Section I -----------------------------------------------------------
  h1("I. Research Foundation"),
  h2("Problem Statement"),
  body(
    "During a flood, the question a Metro Manila resident actually needs answered is narrow and local: is the water on my street passable right now? The information available to them answers a different question.",
  ),
  body(
    "Official warnings operate at the scale of a river basin or a city. They are authoritative about rainfall and river level, and silent about the two hundred metres between somebody and the main road. [VERIFY: cite PAGASA's public warning products and their spatial granularity.]",
  ),
  body(
    "The gap is filled informally, by neighbours posting photographs and text to Facebook groups and Messenger threads. That channel is fast and genuinely useful, and it fails in three specific ways. First, it is unstructured: “baha na dito” cannot be compared, sorted, or aged, and two posts an hour apart cannot be told apart for currency. Second, it is not addressable by location, because a post attaches to a group rather than to a coordinate, so a reader cannot ask what is happening on their own street. Third, it has no notion of staleness: a photograph from three hours ago looks exactly like one from three minutes ago, and floodwater moves in far less than three hours.",
  ),
  body(
    "[VERIFY: at least one peer-reviewed source on crowdsourced or participatory disaster reporting. Read before citing. PetaBencana.id, from the MIT Urban Risk Lab, is crowdsourced flood mapping in Jakarta and is directly comparable to this work; the Ushahidi platform literature is the other obvious starting point.]",
  ),
  body(
    "[VERIFY: one industry or government statistic establishing the scale of urban flooding in Metro Manila. NDRRMC situational reports and MMDA flood-control publications are the credible primary sources.]",
  ),

  h2("Target Audience"),
  body(
    "The primary persona is a commuter deciding a route: a resident of Marikina or Taguig, on a phone, on mobile data, deciding within the next few minutes whether to walk or ride down a particular street. Their pain point is not a lack of weather information. It is that no available source is specific to the street they are standing on.",
  ),
  body(
    "The secondary persona is a barangay disaster desk officer, who receives reports of people in distress and must triage them with no way to judge which are credible.",
  ),
  note(
    "Limitation stated rather than hidden: these personas are derived from the design constraints and the developer's own locality, not from formal user interviews. A persona presented as research when it is really a designer's assumption is the weakness a panel will find first, and conceding it costs less than being caught by it.",
  ),

  h2("Why Existing Tools Fail"),
  bullet(
    "**PAGASA bulletins** give authoritative rainfall and river levels, and cannot say whether this street is passable.",
  ),
  bullet(
    "**News and broadcast** are city-scale and delayed, and carry nothing at street resolution.",
  ),
  bullet(
    "**Facebook and Messenger groups** are fast, local and human, and are unstructured, unsearchable by location, and carry no age.",
  ),

  h2("Core Value Proposition"),
  body(
    "Antas turns informal Facebook-group behaviour into structured, located, time-stamped observations, and refuses to become an emergency service while doing it. Three features carry that proposition.",
  ),
  bullet(
    "**A depth scale measured in body parts, not centimetres** — ankle, knee, waist, chest, above head. A person standing in water knows where it reaches on them; they do not know it is sixty-three centimetres. The scale is the interface.",
  ),
  bullet(
    "**Every reading carries its age.** The map refuses to draw data older than six hours rather than presenting it as current.",
  ),
  bullet(
    "**A hard boundary, stated on every relevant screen.** Antas reports water. It dispatches nobody. It says so on the guide, on the SOS screen, and on the shared link preview itself.",
  ),

  pageBreak(),

  // --- Section II ----------------------------------------------------------
  h1("II. Software Architecture and Purpose"),
  h2("Feature Set"),
  bullet("**Depth map.** Reports as pins coloured by depth, with deepest-first clustering."),
  bullet("**Report flow.** Five-level body-scale gauge, optional photo, GPS accuracy check."),
  bullet("**Kumusta na?** Three-state freshness answers on an existing report."),
  bullet("**Tulong, the SOS.** Live photo, three-second hold, no account required."),
  bullet("**Moderator console.** Triage queue scoped to a barangay, with trust scoring."),
  bullet("**Gabay.** Preparedness guide and hotline numbers, cached for offline use."),
  bullet("**Filipino and English.** Whole-interface language toggle."),

  h2("Architecture"),
  body(
    "The client is built on the Next.js App Router, using server components for content and client components for the map and interactive controls. Data lives in Supabase: PostgreSQL with geospatial queries, Row Level Security, Storage for photographs, and Realtime for live queue updates. The map is MapLibre GL over CARTO basemaps, switching between day and night styling according to Manila clock time. Rainfall and elevation come from Open-Meteo and feed the trust score.",
  ),
  figure(1, "System architecture. Every path to data passes through Row Level Security."),
  body(
    "The system comprises nine tables across twenty-six migrations, and seventeen database functions. Security is enforced in PostgreSQL through Row Level Security rather than in application code. A moderator's barangay scope, the confidentiality of a reporter's phone number, and the visibility of SOS photographs are all database predicates, so no route can bypass them by accident, including a route added later by somebody who has not read this report.",
  ),

  h2("Data Model"),
  figure(
    2,
    "Entity relationships. Key columns only; profiles extends Supabase's auth.users rather than replacing it.",
  ),
  body(
    "Two details in the schema carry design decisions rather than mere structure. The depth column on sos_signals is nullable, because the emergency form stopped asking for one, since nobody in danger should be working a five-level selector. And signal_events records a row every time a moderator so much as opens a signal, which is what keeps the broad admin scope accountable.",
  ),

  h2("Workflow: The SOS Trust Score"),
  body(
    "The most substantial algorithm in the system scores an incoming distress signal from six groups of evidence: corroborating nearby reports, recent rainfall, elevation relative to surroundings, the reporter's history, evidence quality including whether the photograph has been submitted before, and behavioural signals such as account age.",
  ),
  figure(
    3,
    "SOS trust scoring. A gap in the system's knowledge scores as unknown, never as evidence against the sender.",
  ),
  body(
    "One principle governs the scorer, and it is the strongest design argument in this project: a gap in the system's knowledge is never scored as evidence against the person asking for help. An unreachable weather provider, an unfetchable photograph, or a question the sender was never asked all score identically to a clean result. The system ranks signals it knows less about lower; it never refuses one.",
  ),
  body(
    "The distinction matters in practice. An SOS is no longer asked for a depth, so the two checks that exist only to contradict a claimed depth withdraw rather than treating silence as a shallow claim. Otherwise the system would penalise people for a form field it had deliberately chosen not to show them, pushing the fastest askers toward the bottom of the queue.",
  ),

  h2("Information Hierarchy"),
  figure(
    4,
    "Information hierarchy and core user journeys. There is no onboarding: the map is the first screen.",
  ),
  body(
    "The map is the default screen because the product's premise is a question about a place. Reporting is a raised centre action rather than a peer tab, because it is the single contribution the system asks of its users. Tulong sits in the tab bar but is coloured unlike its neighbours, and is reachable by a plain labelled tap, because an emergency path hidden behind a gesture cannot be discovered by somebody who needs it now.",
  ),

  pageBreak(),

  // --- Section III ---------------------------------------------------------
  h1("III. Design Prompt and Rationale"),
  body(
    "The interface was generated with Google Stitch and then filtered. The prompts below are given in the order they were issued, each with the reasoning behind it.",
  ),

  h2("Prompt 1: Context and Constraints"),
  code("Design a mobile-first flood reporting app for Metro Manila residents."),
  code(
    "CONTEXT: Users open this during heavy rain, one-handed, on a phone, outdoors in daylight, often on poor mobile data. Many are deciding within seconds whether a street is safe to walk down.",
  ),
  code(
    "CONSTRAINTS: Light interface only, because it is read outdoors in daylight. No decorative illustration, gradients or glassmorphism. All primary navigation reachable by thumb at the bottom of the screen. Filipino-first labels. Minimum 48px touch targets.",
  ),
  code(
    "DO NOT include: rescue dispatch, evacuation orders, official authority badges, or any label implying floodwater is safe.",
  ),
  body(
    "**Rationale.** The negative constraints do the real work. An unconstrained generator reaches for the visual language of emergency dashboards, with sirens, alerts and authority, which this system has no right to use. Stating the prohibitions in the prompt is cheaper than rejecting the output afterwards.",
  ),

  h2("Prompt 2: The Map Screen"),
  code(
    "Screen 1, Map. Full-bleed map filling the viewport. Floating search field pinned to the top. Bottom tab bar with five items: Map, Guide, Report as a raised circular centre button, Me, and Help. A compact legend showing five water-depth levels from ankle to above-head, ordered deepest first. A weather chip. No header bar; the map is the content.",
  ),
  body(
    "**Rationale.** Depth is ordered deepest-first so the legend reads as a warning rather than a neutral scale. The header is omitted because on a phone, three stacked bands of chrome consume roughly a fifth of the screen before the product appears.",
  ),

  h2("Prompt 3: The Report Flow"),
  code(
    "Screen 2, Report water depth. A large vertical selector with five options labelled by body part: ankle, knee, waist, chest, above head. Each option has a distinct colour from pale blue to deep purple. A human figure beside the list showing where the water reaches. Optional add-photo card below. One primary submit button.",
  ),
  body(
    "**Rationale.** The scale is a body because the measurement is taken against a body. A centimetre field would ask the user to convert something they perceive directly into something they must estimate.",
  ),

  h2("Prompt 4: Iteration"),
  code(
    "Refine: reduce the card treatment. Too many surfaces are raised, which flattens the hierarchy. Keep cards only where content is genuinely grouped, and let the depth colour ramp run edge to edge in the selector.",
  ),
  body(
    "**Rationale.** The first generation applied card containers uniformly. When everything is elevated, nothing is emphasised, and the depth ramp, the most important information on the screen, was competing with its own container.",
  ),

  pageBreak(),

  // --- Section IV ----------------------------------------------------------
  h1("IV. Reflection and Usability Evaluation"),
  h2("Where the Generated Interface Aligned Well"),
  body(
    "Several proposals were adopted essentially unchanged, and each solved a real problem. Place search mattered because the map opens over the whole of Metro Manila while the user's question is about one street; before search, answering it began with a pinch across the region. A bottom tab bar is correct for one-handed phone use and moved navigation out of the header entirely. A my-reports screen fixed the fact that a submitted report previously vanished into the map with no way to see or withdraw a contribution. And a locate button answers take me to me, which is a more common question than take me to Malanday.",
  ),

  h2("Where the Generated Interface Was Actively Unsafe"),
  body(
    "This is the finding worth reporting. Several generated proposals were plausible, well-composed, and would have caused harm. Each was rejected, and the reason was the same every time: they assumed an authority relationship, or live operational data, that the system does not have.",
  ),
  bullet(
    "**Official alert broadcasts with forced-evacuation orders.** An evacuation order is an instruction only an authority may issue.",
  ),
  bullet(
    "**Evacuation centre capacity, shown as sixty per cent full.** Being wrong sends a family through floodwater to a centre that is full. Capacity is not ours to know.",
  ),
  bullet(
    "**Verified-authority badges on posts.** This impersonates an institution the project has no relationship with.",
  ),
  bullet(
    "**A Ligtas, or safe, label on ankle-deep water.** No flood depth is safe. Ankle-deep water hides open drains and moves fast.",
  ),
  bullet(
    "**A satellite basemap with filled heat zones.** This claims continuous area knowledge derived from sparse point reports.",
  ),
  bullet(
    "**Free-text comments under a report.** Nobody moderates this application, and a comment saying the water is gone could sit beneath water that is still chest-deep.",
  ),

  h2("What This Says About AI-Assisted Interface Design"),
  body(
    "The generator was reliably good at conventions, such as where controls belong, what a mobile flood application usually contains, and how to structure a tab bar. It was reliably unable to distinguish what the system is entitled to claim. It proposed an authority badge and a capacity indicator with exactly the same confidence as it proposed a search field, because visually they are all simply components.",
  ),
  body(
    "The judgement that separates them is not a design skill. It is knowing what data the system actually holds and what it may honestly assert, which the tool cannot know and which no prompt reliably supplies.",
  ),
  body(
    "The practical conclusion is that AI interface generation was most valuable for layout and convention, and required a domain-informed reviewer with the authority to refuse. Two of the refusals above, the Ligtas label and free-text comments, would have passed an ordinary usability review. They fail only against the question: what happens if this is wrong while somebody is standing in water?",
  ),

  h2("Usability Evaluation Against the Target User"),
  bullet(
    "**Readable outdoors in daylight.** Light interface on all task pages; the map follows the Manila clock.",
  ),
  bullet(
    "**Usable one-handed.** All navigation sits in a bottom tab bar, with 48-pixel minimum targets.",
  ),
  bullet(
    "**Usable on poor connectivity.** The shell and guide are cached; the map keeps its last snapshot and always states its age.",
  ),
  bullet(
    "**Usable with no account.** The SOS requires none, and neither do the map or the guide.",
  ),
  bullet(
    "**Readable by non-Tagalog speakers.** A full Filipino and English toggle, with no partial translation.",
  ),
  body(
    "Remaining limitations, stated rather than hidden: barangay granularity is uneven outside Marikina, Taguig and the City of Manila; the hotline numbers were supplied rather than independently verified; and the personas were not validated through formal user research.",
  ),

  h2("Appendix: Verification"),
  body(
    "Claims in Sections II through IV are checkable in the repository at github.com/blckltsdmsnw/antas. The file docs/STATUS.md records what was built and why, docs/design/design.md section 12 lists every refused feature with its reasoning, and the test suite, of 260 unit tests and 60 end-to-end tests, encodes the safety rules as assertions, including tests that the interface never promises rescue in either language.",
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
