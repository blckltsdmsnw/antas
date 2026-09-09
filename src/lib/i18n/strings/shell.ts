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
     * It also says what Antas does NOT do. A stranger seeing an app like this
     * in a group chat could reasonably assume it summons help; the guide and
     * the SOS screen both say otherwise, and the preview is read before either
     * of them.
     *
     * It stopped naming only floods on 2026-09-09, for the same reason it
     * stopped saying "for Marikina": the product took five more hazards in
     * migration 0028 and the preview still promised one, so somebody with a
     * fire in the next street would read it and decide it was not for them.
     * The title echoes the report screen's own first question, "Ano ang
     * nangyayari?", so the preview and the app ask the same thing.
     */
    metaTitle: "Antas - ano ang nangyayari sa kalye mo",
    metaDescription:
      "Mga ulat ng baha, sunog, lindol, aksidente at medikal mula sa mga taong nasa lugar, sa Metro Manila. Hindi ito nagpapadala ng rescue.",
    ogTagline: "Ano ang nangyayari sa kalye mo ngayon",
    ogAlt: "Antas - mga ulat ng insidente sa Metro Manila",
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

    metaTitle: "Antas - what is happening on your street",
    metaDescription:
      "Reports of flood, fire, earthquake, accident and medical incidents from people on the ground, across Metro Manila. It does not send rescue.",
    ogTagline: "What is happening on your street right now",
    ogAlt: "Antas - street-level incident reports across Metro Manila",
  },
);
