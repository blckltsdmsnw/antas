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
  },
);
