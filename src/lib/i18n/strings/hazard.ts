import { dict } from "../dict";

/**
 * What is happening, and how bad it is.
 *
 * Flood has no severity words here: it keeps the five body levels in `map.ts`,
 * which are the product's own measurement and predate this file. Every other
 * hazard gets three.
 *
 * Every word answers one question - what would a barangay tanod want to know
 * from somebody standing there? - so each is something a person can SEE, not a
 * judgement they are asked to make. "Nakakabahala" asks for an opinion;
 * "May nakulong" reports a fact.
 *
 * Read under pressure. Short, concrete, no jargon.
 */
export const hazard = dict(
  {
    pickPrompt: "Ano ang nangyayari?",
    back: "Bumalik",
    severityPrompt: "Ano ang nakikita mo?",

    hazardFlood: "Baha",
    hazardFire: "Sunog",
    hazardEarthquake: "Lindol",
    hazardAccident: "Aksidente",
    hazardMedical: "Medikal",
    hazardOther: "Iba pa",

    // -- Owner-corrected 2026-08-27. "naipit" is the word a person uses for
    // trapped, not "nakulong". "Iba pa" escalates tanod -> tulong ->
    // nanganganib; its level 2 previously duplicated Aksidente level 2 word
    // for word, which would have made two different reports read identically
    // in the console. -----------------------------------------------------
    fire1: "May usok, walang apoy",
    fire2: "May apoy sa isang bahay",
    fire3: "Kumakalat sa ibang bahay",

    earthquake1: "Walang nasira",
    earthquake2: "May nasirang gusali",
    earthquake3: "May gumuho o naipit",

    accident1: "Walang nasaktan",
    accident2: "May nasaktan",
    accident3: "May naipit o malubha",

    medical1: "May sakit, gising",
    medical2: "Hindi makatayo",
    medical3: "Walang malay",

    other1: "Kailangan ng tanod",
    other2: "Kailangan ng tulong",
    other3: "May nanganganib na tao",


    // NOT "call 911". The owner reports that 911 does not connect in practice
    // here, so that advice spends the minutes that matter on a call that will
    // not land. The barangay is the real dispatcher for a medical emergency -
    // it can send someone, or a vehicle, to bring the patient to a hospital.
    // No number: the app does not know sixteen barangay hotlines, and a
    // resident already knows how to reach their own.
    tellBarangay: "Ipaalam din sa barangay ninyo.",
  },
  {
    pickPrompt: "What is happening?",
    back: "Back",
    severityPrompt: "What can you see?",

    hazardFlood: "Flood",
    hazardFire: "Fire",
    hazardEarthquake: "Earthquake",
    hazardAccident: "Accident",
    hazardMedical: "Medical",
    hazardOther: "Other",

    fire1: "Smoke, no flames",
    fire2: "Flames in one house",
    fire3: "Spreading to other houses",

    earthquake1: "Nothing damaged",
    earthquake2: "A building is damaged",
    earthquake3: "Collapse, or someone trapped",

    accident1: "Nobody hurt",
    accident2: "Somebody hurt",
    accident3: "Somebody trapped, or serious",

    medical1: "Ill, but awake",
    medical2: "Cannot stand",
    medical3: "Unconscious",

    other1: "Needs a tanod",
    other2: "Help is needed",
    other3: "Somebody is in danger",

    tellBarangay: "Tell your barangay too.",
  },
);
