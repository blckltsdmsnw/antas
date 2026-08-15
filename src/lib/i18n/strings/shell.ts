import { dict } from "../dict";

/**
 * The frame around every screen: navigation, the header, the language control.
 *
 * "Antas" is not in here. The product's name is the same word in both
 * languages, and routing it through a dictionary would only invite somebody to
 * "translate" it one day.
 */
export const shell = dict(
  {
    mapa: "Mapa",
    gabay: "Gabay",
    report: "I-report",
    ako: "Ako",
    tulong: "Tulong",

    primaryNav: "Pangunahing nabigasyon",
    console: "Console",

    /**
     * The toggle names each language IN ITSELF, never translated.
     *
     * Somebody who cannot read the language currently on screen has to be able
     * to find the way out of it. "English" written as "English" is legible to a
     * reader stranded in Tagalog; "Ingles" is not. So both halves of this
     * dictionary carry identical values for these two keys - that is the point,
     * not an oversight, and it is why they are not simply hardcoded: the next
     * person to see them should find this note.
     */
    langFilipino: "Filipino",
    langEnglish: "English",
    langLabel: "Wika",

    /**
     * What a shared link says about itself.
     *
     * The old description claimed the app was "for Marikina", which stopped
     * being true when the pilot area widened to Metro Manila - so somebody in
     * Taguig reading the preview would decide it was not for them and never
     * open it. A link preview is read by people who have not seen the product,
     * which makes it the easiest place in the whole thing to be quietly wrong.
     *
     * It also says what Antas does NOT do. A stranger seeing a flood app in a
     * group chat could reasonably assume it summons help; the guide and the SOS
     * screen both say otherwise, and the preview is read before either of them.
     */
    metaTitle: "Antas - gaano kalalim ang baha",
    metaDescription:
      "Mga ulat ng lalim ng tubig mula sa mga taong nasa lugar, sa Metro Manila. Hindi ito nagpapadala ng rescue.",
    ogTagline: "Gaano kalalim ang baha ngayon",
    ogAlt: "Antas - mga ulat ng lalim ng baha sa Metro Manila",
  },
  {
    mapa: "Map",
    gabay: "Guide",
    report: "Report",
    ako: "Me",
    // Not "SOS" and not "Emergency". "Help" is the word somebody reaches for
    // under stress, and it stays a plain one in both languages.
    tulong: "Help",

    primaryNav: "Main navigation",
    console: "Console",

    langFilipino: "Filipino",
    langEnglish: "English",
    langLabel: "Language",

    metaTitle: "Antas - how deep is the flood",
    metaDescription:
      "Water-depth reports from people on the ground, across Metro Manila. It does not send rescue.",
    ogTagline: "How deep is the flood right now",
    ogAlt: "Antas - flood depth reports across Metro Manila",
  },
);
