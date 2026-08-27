import { dict } from "../dict";

/**
 * `/sos`, and everything the sender is told afterwards.
 *
 * THE MOST DANGEROUS STRINGS IN THE PRODUCT. This is the one screen read by
 * somebody who may still be standing in water, and the failure mode is not a
 * crash - it is a sentence that makes a person wait instead of climbing.
 *
 * Every line here obeys the rule from `lib/sos/progress.ts`: report what has
 * happened, never what will happen. "Binuksan na ito ng barangay" is a fact
 * about a person having read something. "Help is on the way" is a promise this
 * system cannot keep, and Antas dispatches nobody.
 *
 * Two things the English half must not do, both of which read more naturally
 * and are both wrong:
 *
 * - It must not upgrade "sinuri" or "kinumpirma" into anything resembling
 *   dispatch. `confirmed` means a moderator judged the signal credible, and it
 *   still says outright that nobody is necessarily coming.
 * - It must not soften the demonstration notice. "Walang tunay na rescue
 *   service na nakakatanggap nito" is the sentence that stops somebody relying
 *   on this instead of calling 911, and it stays exactly that blunt.
 *
 * `progress.test.ts` asserts these against the sentences they must never
 * produce, in both languages.
 */
export const sos = dict(
  {
    title: "Humingi ng tulong",
    demoNotice:
      "Demonstrasyon lamang ito. Walang tunay na rescue service na nakakatanggap nito. Sa totoong emergency, direktang tawagan ang inyong barangay.",

    photoReady: "May larawan na. Handa nang ipadala.",
    photoPrompt: "Kailangan ng larawan ng tubig ngayon",
    photoNote:
      "Hindi puwedeng galing sa gallery. Ang barangay lang ang makakakita nito.",
    photoOpen: "Buksan ang camera",
    photoFirst: "Kumuha muna ng larawan bago magpadala.",

    noteLabel: "Dagdag na detalye (opsyonal)",
    notePlaceholder: "Halimbawa: tatlo kami, may matanda",

    holdSending: "Ipinapadala...",
    holdLabel: "Pindutin nang 3 segundo para humingi ng tulong",

    sentTitle: "Naipadala na ang SOS mo.",
    sentBody:
      "Susuriin ito ng barangay. Manatiling ligtas at kung kaya, pumunta sa mas mataas na lugar.",
    inaccurate: (accuracy: string) =>
      `Malabo ang lokasyon mo — mga ${accuracy} ang puwedeng pagkakamali. Naipadala pa rin ang SOS mo. Kung may makakausap ka, sabihin mo ang eksaktong kalye o palatandaan.`,

    phoneTitle: "Mag-iwan ng numero (opsyonal)",
    phoneNote:
      "Kung may kailangang linawin tungkol sa lokasyon mo, ito ang gagamitin. Hindi ito nakikita sa mapa at walang ibang user ang makakakita nito. Puwede mo ring laktawan ito.",
    phoneSave: "I-save ang numero ko",

    signIn: "Mag-sign in",

    errInvalidCoordinates: "Hindi mabasa ang lokasyon mo.",
    errOutsidePilotArea: "Sa ngayon, Metro Manila lang ang saklaw ng Antas.",
    errNotSignedIn:
      "Hindi nakagawa ng pansamantalang account. Mag-sign in para makapagpadala ng SOS.",
    errAlreadyActive: "May aktibo ka nang SOS. Hinihintay pa itong suriin.",
    errInsertFailed: "May problema sa pagpapadala. Subukan ulit.",
    errUploadFailed: "Hindi naipadala ang larawan. Subukan ulit.",
    errNoLocation: "Buksan ang location para makapagpadala ng SOS.",

    statusUnavailable:
      "Hindi makuha ang kalagayan ng report mo ngayon. Naipadala pa rin ito.",

    pendingHeadline: "Naipadala na, hindi pa nabubuksan",
    pendingDetail:
      "Nasa listahan na ito ng barangay. Wala pang nakakabukas nito ngayon.",
    reviewHeadline: "Binuksan na ito ng barangay",
    reviewDetail:
      "May nagbukas ng report mo. Hindi ito nangangahulugang may paparating na tulong.",
    confirmedHeadline: "Kinumpirma ng barangay",
    confirmedDetail:
      "Tinasa nilang totoo ang report mo. Hindi pa rin ito nangangahulugang may susundo sa iyo.",
    dismissedHeadline: "Hindi itinuloy ang report na ito",
    dismissedDetail:
      "Sinuri ito ng barangay at hindi itinuloy. Kung nasa panganib ka pa rin, tawagan ang inyong barangay.",
    resolvedHeadline: "Markado nang tapos",
    resolvedDetail: "Isinara na ito ng barangay.",
  },
  {
    title: "Ask for help",
    demoNotice:
      "This is a demonstration only. No real rescue service receives this. In a real emergency, contact your barangay directly.",

    photoReady: "Photo taken. Ready to send.",
    photoPrompt: "A photo of the water right now is required",
    photoNote: "It cannot come from your gallery. Only the barangay can see it.",
    photoOpen: "Open the camera",
    photoFirst: "Take a photo before sending.",

    noteLabel: "More detail (optional)",
    notePlaceholder: "For example: there are three of us, one elderly",

    holdSending: "Sending...",
    holdLabel: "Press and hold for 3 seconds to ask for help",

    sentTitle: "Your SOS has been sent.",
    // "Susuriin ito ng barangay" is a statement about reading, not responding,
    // and stays one. The advice to get higher is kept in the same breath,
    // because it is the thing the sender can actually act on.
    sentBody:
      "The barangay will review it. Stay safe, and if you can, get to higher ground.",
    inaccurate: (accuracy: string) =>
      `Your location is imprecise — it could be off by about ${accuracy}. Your SOS was still sent. If you can reach anyone, tell them the exact street or landmark.`,

    phoneTitle: "Leave a number (optional)",
    phoneNote:
      "If anything about your location needs clarifying, this is what will be used. It is not shown on the map and no other user can see it. You can skip this.",
    phoneSave: "Save my number",

    signIn: "Sign in",

    errInvalidCoordinates: "Your location could not be read.",
    errOutsidePilotArea: "For now, Antas only covers Metro Manila.",
    errNotSignedIn:
      "A temporary account could not be created. Sign in to send an SOS.",
    errAlreadyActive:
      "You already have an active SOS. It is still awaiting review.",
    errInsertFailed: "Something went wrong sending it. Try again.",
    errUploadFailed: "The photo was not sent. Try again.",
    errNoLocation: "Turn on location to send an SOS.",

    // Never "no updates". A failed read is not silence, and saying it was would
    // be the most misleading thing available on this screen.
    statusUnavailable:
      "Your report's status cannot be fetched right now. It was still sent.",

    pendingHeadline: "Sent, not opened yet",
    pendingDetail: "It is on the barangay's list. Nobody has opened it yet.",
    reviewHeadline: "The barangay has opened this",
    // The strongest thing that can honestly be said, and deliberately about
    // reading rather than responding.
    reviewDetail:
      "Someone opened your report. This does not mean help is on the way.",
    confirmedHeadline: "Confirmed by the barangay",
    confirmedDetail:
      "They judged your report to be real. This still does not mean anyone is coming for you.",
    dismissedHeadline: "This report was not taken forward",
    dismissedDetail:
      "The barangay reviewed it and did not take it forward. If you are still in danger, contact your barangay.",
    resolvedHeadline: "Marked as finished",
    resolvedDetail: "The barangay has closed this.",
  },
);
