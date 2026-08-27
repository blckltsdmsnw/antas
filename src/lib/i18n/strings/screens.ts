import { dict } from "../dict";

/**
 * The remaining screens: filing a report, your own reports, signing in, and the
 * moderator console.
 *
 * Two things in here are not ordinary interface copy and are commented where
 * they sit: the suspension notice, which must not invite a retry that cannot
 * work, and the relative-time units, which are what tell somebody how old the
 * reading under their thumb is.
 */
export const screens = dict(
  {
    // -- Filing a report -----------------------------------------------------
    reportTitle: "Gaano kalalim ang tubig?",
    reportLede: "Pindutin kung saan umaabot ang tubig sa katawan ngayon.",
    reportSend: "I-report",
    reportLocating: "Hinahanap ang lokasyon...",
    reportSending: "Ipinapadala...",
    reportDoneTitle: "Salamat. Naitala na ang report mo.",
    reportDoneBody: "Makikita na ito ng iba sa mapa. Mag-ingat.",
    reportBackToMap: "Bumalik sa mapa",

    reportPhotoPrompt: "Magdagdag ng larawan ng tubig",
    reportPhotoPromptOther: "Magdagdag ng larawan",
    reportPhotoNote: "Opsyonal. Makikita ito ng lahat sa mapa.",
    // For medical and accident, which never reach the map - see sos.ts's
    // photoNote, whose second sentence this reuses verbatim so the promise
    // matches what `reportDoneNotOnMap` says two taps later.
    reportPhotoNoteBarangayOnly: "Opsyonal. Ang barangay lang ang makakakita nito.",
    reportPhotoOpen: "Kumuha ng larawan",
    reportPhotoRemove: "Alisin ang larawan",
    yourPhoto: "Ang larawang kinuha mo",
    choosePhoto: "Pumili ng larawan",
    openingCamera: "Binubuksan ang camera...",
    takePhoto: "Kumuha ng larawan",
    holdProgress: "Progreso ng pagpindot",

    vagueTitle: "Malabo ang lokasyon mo",
    vagueLede: (accuracy: string) =>
      `Hindi sigurado ang telepono mo kung nasaan ka — mga ${accuracy} ang puwedeng pagkakamali. Ang report mo ay puwedeng mapunta sa maling kalye.`,
    vagueAdvice:
      "Kung nasa loob ka ng gusali, lumabas o lumapit sa bintana, pagkatapos subukan ulit. Kung tama naman ang lugar, ituloy mo.",
    vagueRetry: "Subukan ulit ang lokasyon",
    vagueContinue: "Ituloy — tama ang lugar",
    cancel: "Kanselahin",

    errInvalidDepth: "Pumili ng lalim ng tubig.",
    errMissingHazard: "Pumili kung ano ang nangyayari.",
    errMissingSeverity: "Pumili kung ano ang nakikita mo.",
    errDepthNotAllowed: "Lalim ng tubig ay para lang sa baha.",
    reportDoneNotOnMap: "Naipadala sa barangay. Hindi ito ilalagay sa mapa.",
    errInvalidCoordinates: "Hindi mabasa ang lokasyon mo.",
    errOutsidePilotArea: "Sa ngayon, Metro Manila lang ang saklaw ng Antas.",
    errNotSignedIn: "Mag-sign in muna bago mag-report.",
    errInsertFailed: "May problema sa pag-save. Subukan ulit.",
    // Deliberately does NOT say "subukan ulit": retrying cannot work, and
    // inviting it wastes the time of somebody owed a straight answer. It also
    // says the emergency route is still open, which is true - suspension
    // withdraws the ability to contribute, never the ability to ask for help.
    errSuspended:
      "Naka-hold ang account mo dahil sa mga naunang report na hindi napatunayang totoo. Hindi ka muna makakapag-report. Kung nasa panganib ka, gamitin pa rin ang Tulong o tawagan ang inyong barangay.",
    errNoLocation: "Buksan ang location para makapag-report.",
    errUploadFailed: "Hindi naipadala ang larawan. Subukan ulit.",

    // -- A report, opened ----------------------------------------------------
    detailLabel: "Detalye ng report",
    detailClose: "Isara ang detalye",
    detailOpenPhoto: "Buksan ang larawan sa buong screen",
    detailZoomCue: "Pindutin para lakihan",
    detailPhotoFailed: "Hindi ma-load ang larawan.",
    detailNoPhoto: "Walang larawan ang report na ito.",
    detailPhotoAlt: (depth: string) => `Tubig na ${depth.toLowerCase()}`,
    detailMeter: (depth: string, rank: number, total: number) =>
      `Lalim: ${depth}, ${rank} sa ${total}`,
    standing: "Madalas tumutugma ang mga naunang report ng nag-report nito",

    historyHint: "Pindutin ang mapa para makita ang kasaysayan.",
    historySearching: "Naghahanap...",
    historyEmpty: "Walang naitalang baha sa lugar na ito.",
    historyCount: (count: number) => `${count} report sa lugar na ito`,
    historyDeepest: (depth: string) => `Pinakamalalim: ${depth}`,

    freshGone: "Wala na",
    freshSame: "Ganoon pa rin",
    freshDeeper: "Mas mataas na",
    freshGoneSummary: "Wala na raw ang tubig",
    freshSameSummary: "Ganoon pa rin daw",
    freshDeeperSummary: "Mas mataas na raw",
    freshLabel: "Kumusta na ang lugar na ito",
    freshTitle: "Kumusta na?",
    freshFailed: "Hindi makuha ang mga update ngayon.",
    freshSignIn: "Mag-sign in muna para makasagot.",
    freshAnswers: (n: number) => `${n} sagot`,
    freshThanks: "Salamat - naitala ang sagot mo.",

    // -- How long ago --------------------------------------------------------
    // The most re-read phrase in the product. `justNow` is compared against by
    // `timestampLabel`, so it must stay one value read from here and never a
    // literal typed twice - a translated copy that drifted from the comparison
    // would quietly append a wall clock to "just now" in one language only.
    justNow: "ngayon lang",
    minutesAgo: (n: number) => `${n} minuto`,
    hoursAgo: (n: number) => `${n} oras`,
    yesterday: "kahapon",
    daysAgo: (n: number) => `${n} araw`,
    months: "Ene Peb Mar Abr May Hun Hul Ago Set Okt Nob Dis",

    // -- Ako -----------------------------------------------------------------
    akoTitle: "Ako",
    akoLoading: "Kinukuha ang mga report mo...",
    akoSignedOut:
      "Mag-sign in para makita ang mga report mo. Hindi kailangan ng account para tingnan ang mapa.",
    akoFailed: "Hindi makuha ang mga report mo ngayon.",
    akoFailedBody: "Hindi ibig sabihin nito na wala kang naipadala.",
    akoSignedInAs: (email: string) => `Naka-sign in bilang ${email}`,
    akoAnonymous:
      "Naka-sign in nang walang account. Nagagamit mo ito dahil nagpadala ka ng SOS.",
    akoPhoneTitle: "Numero para sa emergency",
    akoPhoneNote:
      "Kung magpapadala ka ng SOS, ito ang gagamitin kung may kailangang linawin. Hindi ito nakikita sa mapa at walang ibang user ang makakakita nito. Puwede mo ring iwanang blangko.",
    akoReportsTitle: "Aking mga Report",
    akoNoReports: "Wala ka pang naipadalang report.",
    akoReportLink: "Mag-report ng lalim ng tubig",
    akoUnknownPlace: "Hindi matukoy na lugar",
    akoRemove: "Tanggalin",
    akoSure: "Sigurado ka?",
    akoSignOut: "Mag-sign out",
    akoSignOutSure: "Sigurado ka? Hindi na maibabalik",
    akoSignOutNote:
      "Walang account ang session na ito, kaya kapag nag-sign out ka ay hindi mo na makikita ang SOS mo at ang kalagayan nito. Sa hiniram na telepono, iyan mismo ang dapat gawin.",

    statusActive: "Nasa mapa",
    statusFlagged: "Sinusuri",
    statusHidden: "Tinanggal sa mapa",

    phoneSave: "I-save ang numero",
    phoneSaving: "Sine-save...",
    phoneSaved: "Naka-save na ang numero mo.",
    phoneLabel: "Mobile number",

    // -- Signing in ----------------------------------------------------------
    loginTitle: "Mag-sign in",
    loginSend: "Send sign-in link",
    loginSending: "Ipinapadala...",
    loginCheckTitle: "Tingnan ang email mo",
    loginCheckBody: "Check your email for the sign-in link.",
    loginExpired: "Paso na ang link o nagamit na. Humingi ng bago.",
    loginNoCode: "Walang code sa link. Humingi ng bago.",
    loginFailed: "Hindi naipadala ang link. Subukan ulit.",
    loginLede:
      "Kailangan lang ito bago mag-report. Hindi kailangan para tingnan ang mapa.",
    loginEmail: "Email",
    loginEmailPlaceholder: "ikaw@halimbawa.com",

    // -- Moderator console ---------------------------------------------------
    // The heading names the desk, not a queue. It read "Mga SOS" while the
    // console held only one, and stayed on screen above the report queue once
    // it held two - a heading contradicting the list under it.
    consoleTitle: "Konsola",
    consoleLoading: "Naglo-load...",
    consoleEmpty:
      "Walang aktibong SOS sa barangay mo. Kung wala kang nakikita at inaasahan mong mayroon, tiyakin na moderator ka ng tamang barangay.",
    signalLoading: "Naglo-load, o wala ka sa barangay na ito.",
    signalTitle: "Humihingi ng tulong",
    signalNoPhone: "Walang naibigay na numero ang nag-report.",
    signalAssessment: "Pagsusuri",
    signalPhotoAlt: "Larawan ng tubig mula sa nag-report",
    signalPhotoFailed: "Hindi mabuksan ang larawan.",
    signalDecision: "Desisyon",
    signalDismissReason: "Dahilan ng pag-dismiss",
    signalChoose: "Pumili...",
    signalUnscored: "hindi pa nasusuri",
    signalVagueLocation: (accuracy: string) =>
      `Malabo ang lokasyon: mga ${accuracy} ang puwedeng pagkakamali. Maaaring hindi ito ang tamang kalye.`,
    signalCall: (phone: string) => `Tawagan ${phone}`,
    signalDirections: "Direksyon papunta rito",
    signalPhoneUnverified:
      "Hindi pa na-verify ang numerong ito — ito ang ibinigay mismo ng nag-report.",
    signalPhotoMissing:
      "Laging may larawan ang SOS, kaya ibig sabihin nito ay may problema sa pagkuha nito - hindi ito nangangahulugang walang ipinadalang larawan.",
    signalConfirm: "Kumpirmahin",
    signalDismiss: "I-dismiss",

    decideNoReason: "Pumili ng dahilan bago i-dismiss.",
    decideFailed: "Hindi naitala ang desisyon. Subukan ulit.",
    signalNoBarangay: "walang barangay",
    closePhoto: "Isara ang larawan",

    dismissFalse: "Hindi totoo",
    dismissDuplicate: "Doble - naiulat na ito",
    dismissResolved: "Naayos na",
    dismissInsufficient: "Kulang ang impormasyon",

    // -- Dashboard ng mga report ---------------------------------------------
    // Ang console ay may dalawang tab mula nang hilingin ang dashboard para sa
    // mga isinumiteng report. "Antas" ang tawag sa priyoridad, hindi "score":
    // walang sinusukat na ebidensya sa likod nito - lalim at kung gaano
    // kabago, at iyon lang ang sinasabi nito.
    tabSos: "Mga SOS",
    tabReports: "Mga report",
    reportsEmpty:
      "Walang report na naghihintay ng pagsusuri sa barangay mo.",
    reportsCount: (n: number) => `${n} report`,

    priorityUrgent: "Kagyat",
    priorityWatch: "Bantayan",
    priorityRoutine: "Karaniwan",
    priorityFlagged: "May kwestiyon",

    reportAnswers: (n: number) => `${n} sagot`,
    reportNoAnswers: "wala pang sagot",
    reportOpen: "Buksan ang report",
    reportClose: "Isara",
    reportPhone: "Numero ng nag-report",
    reportNoPhoneGiven: "Walang naibigay na numero ang nag-report.",
    reportCall: (phone: string) => `Tawagan ${phone}`,
    reportPhoneUnverified:
      "Hindi pa na-verify ang numerong ito - ito ang ibinigay mismo ng nag-report.",
    reportDirections: "Direksyon papunta rito",
    reportStanding: (confirmed: number, wrong: number) =>
      `${confirmed} nakumpirma, ${wrong} hindi totoo`,
    reportVague: (accuracy: string) =>
      `Malabo ang lokasyon: mga ${accuracy} ang puwedeng pagkakamali.`,
    // A separate sentence, not the one above with "hindi alam" dropped into it.
    // `formatAccuracy(null)` returns those words, and the result read "mga
    // hindi alam ang puwedeng pagkakamali" - which is not a sentence. An
    // unknown fix and a poor one are different facts and need different words.
    reportVagueUnknown:
      "Hindi alam kung gaano katumpak ang lokasyon ng report na ito.",
    reportPhotoNone: "Walang larawan ang report na ito.",

    reportKeep: "Panatilihin",
    reportHide: "Itago sa mapa",
    reportHideReason: "Dahilan ng pagtatago",
    reportDecided: "Naitala ang desisyon.",
    reportDecideNoReason: "Pumili ng dahilan bago itago.",
    reportDecideFailed: "Hindi naitala ang desisyon. Subukan ulit.",

    hideNotTrue: "Hindi totoo",
    hideDuplicate: "Doble - naiulat na ito",
    hideStale: "Luma na - iba na ang tubig",
    hideWrongPlace: "Mali ang lugar",

    demoOnly: "Demonstrasyon lamang.",
    demoBanner:
      "Walang tunay na rescue service na nakakatanggap ng mga signal na ito. Sa totoong emergency, direktang tawagan ang inyong barangay.",
  },
  {
    reportTitle: "How deep is the water?",
    reportLede: "Press where the water reaches on the body right now.",
    reportSend: "Report",
    reportLocating: "Finding your location...",
    reportSending: "Sending...",
    reportDoneTitle: "Thank you. Your report has been recorded.",
    reportDoneBody: "Others can now see it on the map. Take care.",
    reportBackToMap: "Back to the map",

    reportPhotoPrompt: "Add a photo of the water",
    reportPhotoPromptOther: "Add a photo",
    reportPhotoNote: "Optional. Everyone on the map can see it.",
    reportPhotoNoteBarangayOnly: "Optional. Only the barangay can see it.",
    reportPhotoOpen: "Take a photo",
    reportPhotoRemove: "Remove the photo",
    yourPhoto: "The photo you took",
    choosePhoto: "Choose a photo",
    openingCamera: "Opening the camera...",
    takePhoto: "Take a photo",
    holdProgress: "Press-and-hold progress",

    vagueTitle: "Your location is imprecise",
    vagueLede: (accuracy: string) =>
      `Your phone is not sure where you are — it could be off by about ${accuracy}. Your report could land on the wrong street.`,
    vagueAdvice:
      "If you are indoors, step outside or move to a window, then try again. If the place is right, carry on.",
    vagueRetry: "Try the location again",
    vagueContinue: "Carry on — the place is right",
    cancel: "Cancel",

    errInvalidDepth: "Choose a water depth.",
    errMissingHazard: "Choose what is happening.",
    errMissingSeverity: "Choose what you can see.",
    errDepthNotAllowed: "Water depth is only for a flood.",
    reportDoneNotOnMap: "Sent to the barangay. It will not be drawn on the map.",
    errInvalidCoordinates: "Your location could not be read.",
    errOutsidePilotArea: "For now, Antas only covers Metro Manila.",
    errNotSignedIn: "Sign in before reporting.",
    errInsertFailed: "Something went wrong saving it. Try again.",
    // No "try again" here either, for the same reason as the Tagalog. And the
    // emergency route stays open in both languages - that sentence is the point
    // of the message, not a footnote to it.
    errSuspended:
      "Your account is on hold because earlier reports could not be shown to be true. You cannot report for now. If you are in danger, still use Help or contact your barangay.",
    errNoLocation: "Turn on location to report.",
    errUploadFailed: "The photo was not sent. Try again.",

    detailLabel: "Report detail",
    detailClose: "Close the detail",
    detailOpenPhoto: "Open the photo full screen",
    detailZoomCue: "Press to enlarge",
    detailPhotoFailed: "The photo could not be loaded.",
    detailNoPhoto: "This report has no photo.",
    detailPhotoAlt: (depth: string) => `Water that is ${depth.toLowerCase()}`,
    detailMeter: (depth: string, rank: number, total: number) =>
      `Depth: ${depth}, ${rank} of ${total}`,
    standing: "This reporter's earlier reports have usually held up",

    historyHint: "Press the map to see its history.",
    historySearching: "Searching...",
    historyEmpty: "No flooding has been recorded in this area.",
    historyCount: (count: number) => `${count} reports in this area`,
    // The worst case leads, in both languages. Somebody reading this is
    // deciding whether to walk down the street, and an average would not stop
    // them.
    historyDeepest: (depth: string) => `Deepest: ${depth}`,

    freshGone: "It's gone",
    freshSame: "Same as before",
    freshDeeper: "Higher now",
    freshGoneSummary: "People say the water is gone",
    freshSameSummary: "People say it is the same",
    freshDeeperSummary: "People say it is higher now",
    freshLabel: "How this place is now",
    freshTitle: "How is it now?",
    freshFailed: "The updates cannot be fetched right now.",
    freshSignIn: "Sign in to answer.",
    freshAnswers: (n: number) => `${n} answers`,
    freshThanks: "Thank you - your answer is recorded.",

    justNow: "just now",
    minutesAgo: (n: number) => `${n} min`,
    hoursAgo: (n: number) => `${n} hr`,
    yesterday: "yesterday",
    daysAgo: (n: number) => `${n} days`,
    months: "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec",

    akoTitle: "Me",
    akoLoading: "Fetching your reports...",
    akoSignedOut:
      "Sign in to see your reports. You do not need an account to look at the map.",
    akoFailed: "Your reports cannot be fetched right now.",
    // Same rule as the map: a failed load must not be dressed up as an empty
    // one. "You have filed nothing" and "we could not check" are different
    // sentences, and only one of them is true.
    akoFailedBody: "This does not mean you have sent nothing.",
    akoSignedInAs: (email: string) => `Signed in as ${email}`,
    akoAnonymous:
      "Signed in without an account. You have this because you sent an SOS.",
    akoPhoneTitle: "Number for emergencies",
    akoPhoneNote:
      "If you send an SOS, this is what will be used if anything needs clarifying. It is not shown on the map and no other user can see it. You can leave it blank.",
    akoReportsTitle: "My Reports",
    akoNoReports: "You have not sent a report yet.",
    akoReportLink: "Report a water depth",
    akoUnknownPlace: "Place not identified",
    akoRemove: "Remove",
    akoSure: "Are you sure?",
    akoSignOut: "Sign out",
    akoSignOutSure: "Are you sure? This cannot be undone",
    akoSignOutNote:
      "This session has no account, so once you sign out you will no longer see your SOS or its status. On a borrowed phone, that is exactly what you want.",

    statusActive: "On the map",
    statusFlagged: "Under review",
    statusHidden: "Removed from the map",

    phoneSave: "Save the number",
    phoneSaving: "Saving...",
    phoneSaved: "Your number is saved.",
    phoneLabel: "Mobile number",

    loginTitle: "Sign in",
    loginSend: "Send sign-in link",
    loginSending: "Sending...",
    loginCheckTitle: "Check your email",
    loginCheckBody: "Check your email for the sign-in link.",
    loginExpired: "The link has expired or was already used. Ask for a new one.",
    loginNoCode: "The link has no code in it. Ask for a new one.",
    loginFailed: "The link was not sent. Try again.",
    // Says what signing in is *not* needed for. The map is the product, and
    // nobody should think an account stands between them and it.
    loginLede:
      "This is only needed before reporting. It is not needed to look at the map.",
    loginEmail: "Email",
    loginEmailPlaceholder: "you@example.com",

    consoleTitle: "Console",
    consoleLoading: "Loading...",
    // Names the likeliest cause rather than leaving an empty queue to be read
    // as "nothing is happening" - the queue matches on barangay exactly, and a
    // moderator for the wrong one sees nothing however busy the night is.
    consoleEmpty:
      "No active SOS in your barangay. If you expected to see one, check that you moderate the right barangay.",
    signalLoading: "Loading, or you are not in this barangay.",
    signalTitle: "Asking for help",
    signalNoPhone: "The reporter gave no number.",
    signalAssessment: "Assessment",
    signalPhotoAlt: "Photo of the water from the reporter",
    signalPhotoFailed: "The photo could not be opened.",
    signalDecision: "Decision",
    signalDismissReason: "Reason for dismissing",
    signalChoose: "Choose...",
    signalUnscored: "not yet assessed",
    signalVagueLocation: (accuracy: string) =>
      `Imprecise location: could be off by about ${accuracy}. This may not be the right street.`,
    signalCall: (phone: string) => `Call ${phone}`,
    signalDirections: "Directions to here",
    // Labelled unverified because it is. No SMS provider means no code was ever
    // sent, and a number presented as checked when it was merely typed is a
    // moderator trusting the wrong thing.
    signalPhoneUnverified:
      "This number is not verified — it is what the reporter typed in.",
    // The photograph is the only part of a signal a slider drag cannot fake, so
    // a moderator judging one without it has to know that is what is happening.
    signalPhotoMissing:
      "An SOS always has a photo, so this means it could not be fetched - it does not mean none was sent.",
    signalConfirm: "Confirm",
    signalDismiss: "Dismiss",

    decideNoReason: "Choose a reason before dismissing.",
    decideFailed: "The decision was not recorded. Try again.",
    signalNoBarangay: "no barangay",
    closePhoto: "Close the photo",

    dismissFalse: "Not true",
    dismissDuplicate: "Duplicate - already reported",
    dismissResolved: "Already resolved",
    dismissInsufficient: "Not enough information",

    tabSos: "SOS signals",
    tabReports: "Depth reports",
    reportsEmpty: "No reports are waiting for review in your barangay.",
    reportsCount: (n: number) => `${n} reports`,

    priorityUrgent: "Urgent",
    priorityWatch: "Watch",
    priorityRoutine: "Routine",
    priorityFlagged: "Contested",

    reportAnswers: (n: number) => `${n} answers`,
    reportNoAnswers: "no answers yet",
    reportOpen: "Open the report",
    reportClose: "Close",
    reportPhone: "Reporter's number",
    reportNoPhoneGiven: "The reporter gave no number.",
    reportCall: (phone: string) => `Call ${phone}`,
    reportPhoneUnverified:
      "This number is unverified - it is what the reporter typed in.",
    reportDirections: "Directions to here",
    reportStanding: (confirmed: number, wrong: number) =>
      `${confirmed} confirmed, ${wrong} false`,
    reportVague: (accuracy: string) =>
      `Imprecise location: it could be off by about ${accuracy}.`,
    reportVagueUnknown:
      "How precise this report's location is was never recorded.",
    reportPhotoNone: "This report has no photo.",

    reportKeep: "Keep",
    reportHide: "Hide from the map",
    reportHideReason: "Reason for hiding",
    reportDecided: "The decision was recorded.",
    reportDecideNoReason: "Choose a reason before hiding.",
    reportDecideFailed: "The decision was not recorded. Try again.",

    hideNotTrue: "Not true",
    hideDuplicate: "Duplicate - already reported",
    hideStale: "Stale - the water has moved on",
    hideWrongPlace: "Wrong place",

    demoOnly: "Demonstration only.",
    // Kept as blunt as the Tagalog. This sits on a moderator's screen all day,
    // and the whole point is that it cannot fade into furniture.
    demoBanner:
      "No real rescue service receives these signals. In a real emergency, contact your barangay directly.",
  },
);
