import { dict } from "../dict";

/**
 * The master admin's board, the responder roster, a responder's own list,
 * and the /ako section where somebody says they are a responder.
 *
 * One dictionary rather than four, because these are one workflow read by
 * two people: the master admin who assigns, and the responder who is
 * assigned. Whoever checks the wording should see both sides at once.
 *
 * NOTHING HERE PROMISES A RESCUE TO A RESIDENT. These strings are read on
 * the console and on /ako by people who have signed in to do a job. The
 * resident-facing screens keep their own wording, unchanged.
 */
export const board = dict(
  {
    title: "Board",
    noAccess: "Para lang sa master admin ang board na ito.",
    desktopOnly: "Sa desktop ginagamit ang board. Buksan ito sa mas malapad na screen.",
    backToConsole: "Bumalik sa konsola",
    openBoard: "Buksan ang board",
    loading: "Naglo-load...",
    loadFailed: "Hindi ma-load ang board. Subukan ulit.",

    // -- The four columns. Two arrows in the spec: suriin -> hindi totoo |
    // atensyon -> may nakatalaga. ----------------------------------------
    colNeedsChecking: "Kailangang suriin",
    colNotTrue: "Hindi totoo",
    colNeedsAttention: "Kailangan ng atensyon",
    colAssigned: "May nakatalaga",
    columnEmpty: "Wala",

    kindSos: "SOS",
    kindReport: "Report",
    unspecifiedHazard: "Hindi tinukoy",

    moveTo: (column: string) => `→ ${column}`,
    moveFailed: "Hindi nailipat. Subukan ulit.",
    reasonPrompt: "Bakit hindi totoo?",
    reasonConfirm: "Ilipat",
    cancel: "Kanselahin",

    pickResponder: "Sino ang itatalaga?",
    rosterEmpty:
      "Wala pang nakarehistrong responder. Ang isang responder ay nagfi-fill up ng Responder section sa Ako.",
    assign: "Italaga",
    assignedTo: (name: string) => `Nakatalaga kay ${name}`,
    unassign: "Tapos na",

    // -- Units. Short, because they sit beside a name on a card. --------------
    unitBfp: "BFP",
    unitBarangayRescue: "Barangay rescue",
    unitMedical: "Medikal",
    unitPolice: "Pulis",
    unitOther: "Iba pa",

    // -- The graph. ------------------------------------------------------------
    graphTitle: "Nakaraang 48 oras",
    graphPerHour: "Insidente kada oras",
    graphBarangays: "Bawat barangay",
    graphEmpty: "Walang insidente sa nakaraang 48 oras.",
    graphTable: "Ipakita bilang talahanayan",
    graphHour: "Oras",
    graphCount: "Bilang",

    // -- The responder's own tab on /console. ---------------------------------
    tabAssigned: "Nakatalaga sa akin",
    assignedEmpty: "Wala kang nakatalagang insidente.",
    assignedSince: (when: string) => `Itinalaga ${when}`,
    assignedOpen: "Buksan",
    assignedClose: "Isara",
    assignedCall: (phone: string) => `Tawagan ${phone}`,
    assignedNoPhone: "Walang naibigay na numero.",
    assignedPhoneUnverified: "Hindi pa na-verify ang numerong ito.",
    assignedDirections: "Direksyon papunta rito",
    assignedNote: "Sabi ng nagpadala:",
    assignedDone: "Tapos na",
    assignedDoneSure: "Sigurado ka? Mawawala ito sa listahan mo.",
    assignedFailed: "Hindi naitala. Subukan ulit.",

    consoleNoAccess:
      "Wala kang access sa konsola. Ang mga moderator at ang mga may nakatalagang insidente lang ang may access.",
    confirmedBadge: "Kumpirmado",

    // -- /ako: becoming assignable. -------------------------------------------
    responderTitle: "Responder",
    responderNote:
      "Opsyonal. Kung nasa BFP, rescue, medikal o pulisya ka, ilagay dito para maitalaga ka ng master admin sa isang insidente. Ang pangalan at numero mo ay makikita lang ng master admin.",
    responderName: "Pangalan",
    responderUnit: "Unit",
    responderBarangay: "Barangay",
    responderChoose: "Pumili...",
    responderSave: "I-save",
    responderSaving: "Sine-save...",
    responderSaved: "Naka-save.",
    responderFailed: "Hindi na-save. Subukan ulit.",
    responderNeedsName: "Ilagay ang pangalan mo.",
    responderNeedsUnit: "Pumili ng unit.",
    responderRegistered: "Nakarehistro ka bilang responder.",
  },
  {
    title: "Board",
    noAccess: "This board is for the master admin only.",
    desktopOnly: "The board is for desktop. Open it on a wider screen.",
    backToConsole: "Back to the console",
    openBoard: "Open the board",
    loading: "Loading...",
    loadFailed: "The board could not be loaded. Try again.",

    colNeedsChecking: "Needs checking",
    colNotTrue: "Not true",
    colNeedsAttention: "Needs attention",
    colAssigned: "Assigned",
    columnEmpty: "None",

    kindSos: "SOS",
    kindReport: "Report",
    unspecifiedHazard: "Not specified",

    moveTo: (column: string) => `→ ${column}`,
    moveFailed: "The move did not go through. Try again.",
    reasonPrompt: "Why is it not true?",
    reasonConfirm: "Move",
    cancel: "Cancel",

    pickResponder: "Who is being assigned?",
    rosterEmpty:
      "No responder is registered yet. A responder fills in the Responder section under Ako.",
    assign: "Assign",
    assignedTo: (name: string) => `Assigned to ${name}`,
    unassign: "Done",

    unitBfp: "BFP",
    unitBarangayRescue: "Barangay rescue",
    unitMedical: "Medical",
    unitPolice: "Police",
    unitOther: "Other",

    graphTitle: "Last 48 hours",
    graphPerHour: "Incidents per hour",
    graphBarangays: "By barangay",
    graphEmpty: "No incidents in the last 48 hours.",
    graphTable: "Show as a table",
    graphHour: "Hour",
    graphCount: "Count",

    tabAssigned: "Assigned to me",
    assignedEmpty: "Nothing is assigned to you.",
    assignedSince: (when: string) => `Assigned ${when}`,
    assignedOpen: "Open",
    assignedClose: "Close",
    assignedCall: (phone: string) => `Call ${phone}`,
    assignedNoPhone: "No number was given.",
    assignedPhoneUnverified: "This number is not verified.",
    assignedDirections: "Directions to here",
    assignedNote: "The sender said:",
    assignedDone: "Done",
    assignedDoneSure: "Are you sure? It will leave your list.",
    assignedFailed: "Not recorded. Try again.",

    consoleNoAccess:
      "You do not have access to the console. Only moderators and people with an assigned incident do.",
    confirmedBadge: "Confirmed",

    responderTitle: "Responder",
    responderNote:
      "Optional. If you are with the BFP, a rescue unit, a medical team or the police, fill this in so the master admin can assign you to an incident. Only the master admin sees your name and number.",
    responderName: "Name",
    responderUnit: "Unit",
    responderBarangay: "Barangay",
    responderChoose: "Choose...",
    responderSave: "Save",
    responderSaving: "Saving...",
    responderSaved: "Saved.",
    responderFailed: "Not saved. Try again.",
    responderNeedsName: "Enter your name.",
    responderNeedsUnit: "Choose a unit.",
    responderRegistered: "You are registered as a responder.",
  },
);
