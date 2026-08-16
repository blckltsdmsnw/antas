/**
 * Builds the Antas test script as a .docx, matching the formatting of the
 * research report so the two documents look like one submission.
 *
 *   node docs/test-script/build-test-script.mjs
 *
 * Run from the repository root, not from this directory: OUT_DIR is relative.
 *
 * Formatting matches docs/paper/build-docx.mjs - Times New Roman 12pt, Letter,
 * 1 inch margins, properties written inline on each paragraph rather than
 * through named styles, so nothing depends on a styles.xml Word might swap.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const OUT_DIR = "docs/test-script";
const OUT_NAME = "Antas-Test-Script";
const BUILD = join(process.env.TEMP ?? "/tmp", `antas-tests-${Date.now()}`);

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Runs with **bold** and *italic*, toggled independently so they can nest. */
function runs(text, { size = 24, italic = false, mono = false } = {}) {
  const font = mono ? "Courier New" : "Times New Roman";
  let bold = false;
  let ital = italic;
  const out = [];

  for (const part of text.split(/(\*\*|\*)/g)) {
    if (part === "**") { bold = !bold; continue; }
    if (part === "*") { ital = !ital; continue; }
    if (part === "") continue;

    const props =
      `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>` +
      `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` +
      (bold ? "<w:b/>" : "") +
      (ital ? "<w:i/>" : "");
    out.push(`<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(part)}</w:t></w:r>`);
  }
  return out.join("");
}

function para(text, opts = {}) {
  const {
    size = 24, align = "left", before = 240, after = 240,
    indentLeft = 0, hanging = 0, italic = false, mono = false, keepNext = false,
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
const body = (t) => para(t);
const note = (t) => para(t, { italic: true, size: 22 });
const pageBreak = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

/**
 * A table sized to the printable width. Letter minus 1in margins each side
 * leaves 9360 twips; widths must total that or Word reflows the whole thing.
 */
function table(widths, rows, { headerRow = true, size = 20 } = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  if (total !== 9360) throw new Error(`column widths total ${total}, expected 9360`);

  const border = (side) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;

  // A cell may hold several lines; "\n" splits into separate paragraphs so
  // numbered steps stack instead of running together.
  const cell = (text, w, bold) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>` +
    String(text)
      .split("\n")
      .map((line) => para(bold ? `**${line}**` : line, { size, before: 40, after: 40 }))
      .join("") +
    `</w:tc>`;

  const trs = rows
    .map(
      (cells, r) =>
        `<w:tr>${cells.map((t, i) => cell(t, widths[i], headerRow && r === 0)).join("")}</w:tr>`,
    )
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    `${trs}</w:tbl>` +
    para("", { before: 0, after: 120 })
  );
}

const APP = "https://antas-one.vercel.app";
const FIELD = [2400, 6960];
const detail = (rows) => table(FIELD, rows, { headerRow: false, size: 20 });

const content = [
  title("Software Test Script"),
  centred("Antas: A Street-Level Flood Depth Reporting System for Metro Manila"),
  centred("Gerald Elijah Olores"),
  centred("Centro Escolar University"),
  centred("Empirical Software Innovation and Interface Prototyping"),
  centred("Research Adviser"),
  centred("Dr. Eliza B. Ayo"),
  centred("2026"),
  para("", { before: 200, after: 0 }),

  h1("Application Under Test"),
  body(
    `Antas is a mobile-first web application that lets Metro Manila residents report street-level flood depth on a five-level body-part scale, and read what others have reported. It is a progressive web app and requires no installation. The build under test is the live deployment at ${APP}.`,
  ),
  body(
    "**No account is required** for any step in this document. Neither test writes data to the database, so both can be run repeatedly and by more than one tester without affecting the map or leaving test reports behind.",
  ),
  note(
    "A note on language. The interface has a full Filipino and English toggle, and the expected messages below are given in both. Check whichever language the interface is showing. The toggle sits in the header, on every screen except the map - the map has no header, so switch language from Gabay, I-report, Ako or Tulong.",
  ),

  h1("Test Script 1 - Positive Case"),
  detail([
    ["Test Case ID", "TC_SEARCH_01"],
    ["Test Title", "Verify place search returns a matching barangay and moves the map to it"],
    ["Module", "Map - Place Search"],
    ["Priority", "High"],
    ["Type", "Positive (valid input, expected to succeed)"],
    [
      "Preconditions",
      "1. The tester has a device with a modern browser and an internet connection.\n" +
        "2. No account is needed and the tester does not need to be logged in.\n" +
        `3. The tester is on the map screen at ${APP}\n` +
        "4. The map has finished loading, so the basemap is visible rather than a blank panel.",
    ],
    [
      "Test Steps",
      "1. Tap the search field at the top of the map screen.\n" +
        "2. Type the word: Malanday\n" +
        "3. Wait for the results list to appear below the field.\n" +
        "4. Tap the result labelled Malanday.",
    ],
    [
      "Test Data",
      "Search term: Malanday\n" +
        "A real barangay in Marikina City, present in the application's place data.",
    ],
    [
      "Expected Result",
      "1. A results list appears while typing, from the second character onward.\n" +
        "2. The list contains an entry reading Malanday, with its city, Marikina, shown alongside the name.\n" +
        "3. Tapping the entry closes the results list.\n" +
        "4. The map moves and zooms to Malanday, Marikina, rather than staying where it was.\n" +
        "5. No error message appears, and the tester is still on the map screen.",
    ],
    ["Actual Result", "(To be filled in by the tester after running the test.)"],
    ["Pass / Fail", "(To be filled in after comparing Actual against Expected.)"],
    ["Tester & Date", "________________________          ____________"],
  ]),

  pageBreak(),

  h1("Test Script 2 - Negative Case"),
  detail([
    ["Test Case ID", "TC_REPORT_01"],
    ["Test Title", "Verify the report screen refuses to submit when location permission is denied"],
    ["Module", "Report Flow - Location Guard"],
    ["Priority", "High"],
    ["Type", "Negative (invalid or absent input, expected to fail gracefully)"],
    [
      "Preconditions",
      "1. The tester has a device with a modern browser and an internet connection.\n" +
        "2. Location permission for the site is set to Block, or the tester is ready to press Block when the browser asks.\n" +
        "   In Chrome: tap the icon at the left of the address bar, choose Site settings, then set Location to Block.\n" +
        `3. The tester is on the map screen at ${APP}`,
    ],
    [
      "Test Steps",
      "1. Tap the raised circular I-report button at the centre of the bottom tab bar.\n" +
        "2. Confirm the report screen has opened and the body-part depth selector is visible.\n" +
        "3. Leave the depth selector on its default value, Tuhod (Knee). Do not change it.\n" +
        "4. Tap the I-report submit button at the bottom of the screen.\n" +
        "5. If the browser asks for location, press Block.\n" +
        "6. After the test, restore location permission to Ask, so the device is left as it was found and later tests are unaffected.",
    ],
    [
      "Test Data",
      "Location permission: Blocked, intentionally denied\n" +
        "Water depth: Tuhod (Knee), the default, left unchanged\n" +
        "Photo: none, since the photo is optional and is deliberately not attached",
    ],
    [
      "Expected Result",
      "1. The report is NOT submitted, and no new pin appears on the map.\n" +
        "2. An error message appears reading Buksan ang location para makapag-report. in Filipino, or Turn on location to report. in English.\n" +
        "3. The application does not crash, freeze, or show a blank screen.\n" +
        "4. The tester remains on the report screen, and the depth selector is still usable so the report can be retried after allowing location.",
    ],
    ["Actual Result", "(To be filled in by the tester after running the test.)"],
    ["Pass / Fail", "(To be filled in after comparing Actual against Expected.)"],
    ["Tester & Date", "________________________          ____________"],
  ]),
  note(
    "Why this is the negative case rather than an empty-field test. The depth selector opens already set to Tuhod (Knee), so there is no way to submit the form with no depth chosen, and a missing-field test would be untestable through the interface. Denying location is the invalid input a real user can actually produce, and it is the one the application has to handle without losing the report screen.",
  ),

  pageBreak(),

  h1("Test Summary Table"),
  body(
    "The two scripts above are recorded here alongside the other functions checked in the same session. Status is filled in during testing.",
  ),
  table(
    [700, 1700, 2600, 2600, 1000, 760],
    [
      ["Test No.", "Function to Test", "Action", "Expected Result", "Actual Result", "Status"],
      ["1", "Place search", "Type Malanday in the search field and tap the result", "Map moves to Malanday, Marikina", "", "Pass / Fail"],
      ["2", "Report - location guard", "Block location, then tap I-report to submit", "Turn on location message appears; stays on report screen", "", "Pass / Fail"],
      ["3", "Search - no match", "Type Zzqxwv in the search field", "Walang tugma. (No matches.) appears - NOT Hindi makahanap ngayon., which means the search itself failed", "", "Pass / Fail"],
      ["4", "Navigation", "Tap each tab: Mapa, Gabay, I-report, Ako, Tulong", "The matching screen opens each time", "", "Pass / Fail"],
      ["5", "Guide (Gabay)", "Open Gabay from the tab bar", "Hotline numbers appear first, above the checklist", "", "Pass / Fail"],
      ["6", "Language toggle", "Switch between Filipino and English from the header", "The whole interface changes, with no half-translated screen", "", "Pass / Fail"],
      ["7", "Emergency boundary", "Open Tulong and read the notice at the top", "It states plainly that no rescue service receives the signal", "", "Pass / Fail"],
      ["8", "Offline guide", "Open Gabay, turn off the network, then reload", "The guide still displays from cache", "", "Pass / Fail"],
      ["9", "Mobile layout", "Open the app on a phone-sized screen", "The tab bar is reachable by thumb and nothing is cut off", "", "Pass / Fail"],
      ["10", "SOS hold guard", "Open Tulong, press and hold the button for about one second, then release", "The ring fills while held and resets on release; no SOS is sent", "", "Pass / Fail"],
    ],
  ),

  h1("Notes for the Tester"),
  body(
    "**Test one thing at a time.** If a step fails, stop and record what happened at that step rather than continuing and marking the whole script as a failure.",
  ),
  body(
    "**Record what you saw, not what you expected.** The Actual Result column is only useful if it is written honestly, including when it matches.",
  ),
  body(
    "**If a test fails, note enough for a developer to reproduce it:** the device and browser, the language the interface was in, the exact step number, and the message shown on screen if there was one.",
  ),
  body(
    "**Neither script writes data.** Test 1 only reads place data, and Test 2 is stopped by the location guard before anything is saved, so both can be run more than once without leaving test reports on the public map.",
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

const parts = [
  ["[Content_Types].xml", contentTypes],
  ["_rels/.rels", rels],
  ["word/document.xml", documentXml],
];
parts.forEach(([, xml], i) => writeFileSync(join(BUILD, `part${i}`), xml));

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, `${OUT_NAME}.docx`);

// ZipArchive rather than Compress-Archive: the latter writes entry names with
// backslashes on Windows PowerShell, and OOXML requires forward slashes. The
// file then looks like a valid zip and Word refuses it.
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
console.log("2 detailed scripts (1 positive, 1 negative) + a 10-row summary table");
