import { dict } from "../dict";

/**
 * `/gabay` - preparedness, and the numbers that reach somebody.
 *
 * The most safety-critical prose in the product after `/sos`, because it is
 * read by a person deciding what to do and because a guide carries more
 * authority than any other screen. Two rules the English half obeys:
 *
 * - It never implies Antas can send help. `guide.spec.ts` asserts that against
 *   the rendered page, and the boundary sentence is not an aside - it is the
 *   reason the hotline section exists at all.
 * - It never softens a hazard to read more naturally. "Anim na pulgada ng
 *   umaagos na tubig ay sapat na para matumba ka" becomes six inches knocking
 *   you off your feet, not "shallow water can be risky".
 */
export const guide = dict(
  {
    metaTitle: "Gabay sa Baha - Antas",
    metaDescription:
      "Paghahanda bago, habang, at pagkatapos ng baha. Kasama ang mga numerong dapat tawagan.",

    title: "Handa ka ba?",
    lede: "Ang Antas ay nagsasabi kung gaano kalalim ang tubig. Hindi ito nagpapadala ng rescue at walang nakabantay dito. Ito ang dapat gawin - at ang mga numerong dapat tawagan.",

    hotlinesHeading: "Mga numerong umaabot sa tao",
    role911:
      "Pambansang emergency hotline - pulis, bumbero, medikal, rescue. Ito ang tawagan kung may nanganganib ngayon.",
    roleNdrrmc:
      "Pambansang tanggapan sa sakuna - nagko-koordina ng tugon at nagbibigay ng impormasyon. Hindi ito ang pinakamabilis na daan sa rescue; mas mabilis ang 911 at ang inyong barangay.",
    noLocalNumbers:
      "Pambansa ang mga numerong nasa itaas. Wala pang naidagdag na numero ng barangay o lokal na DRRMO dito. Hanapin at itago ang numero ng inyong barangay bago pa mangailangan.",

    goBagHeading: "Go bag - ihanda bago pa mangyari",
    goBagComplete: "Kumpleto ang go bag mo.",
    goBagProgress: (done: number, total: number) =>
      `${done} sa ${total} nakahanda.`,

    goBagWaterTitle: "Tubig at pagkain",
    goBagWaterBody:
      "Para sa tatlong araw. Piliin ang hindi kailangang lutuin - de-lata, biskwit, tubig na naka-bote.",
    goBagLightTitle: "Flashlight at radyo",
    goBagLightBody:
      "May kasamang ekstrang baterya. Mas maaasahan ang radyo kaysa signal kapag tumaas ang tubig.",
    goBagMedicineTitle: "Gamot at first aid",
    goBagMedicineBody:
      "Alcohol, benda, at ang mga regular na gamot ng bawat isa sa bahay.",
    goBagPapersTitle: "Mahahalagang dokumento",
    goBagPapersBody:
      "Ilagay sa plastik na selyado. ID, titulo, birth certificate, at kopya ng mga numerong nasa itaas.",

    beforeHeading: "Bago ang baha",
    beforeNewsTitle: "Makinig sa opisyal na balita",
    beforeNewsBody:
      "Ang PAGASA at ang inyong barangay ang may sinasabi tungkol sa paglikas. Ang Antas ay nagsasabi kung gaano kalalim ang tubig - hindi ito nagbabala at hindi ito nag-uutos lumikas.",
    beforeRouteTitle: "Alamin ang daan palabas",
    beforeRouteBody:
      "Tukuyin ngayon kung saan ang pinakamalapit na evacuation center at kung aling kalsada ang hindi madaling bahain. Huwag hintaying gabi na at umaapaw na ang tubig.",
    beforeLiftTitle: "Itaas ang mga gamit",
    beforeLiftBody:
      "Ilipat sa mataas na lugar ang mga kagamitang de-kuryente at ang mga papeles. Linisin ang kanal at bubong bago pa dumating ang malakas na ulan.",
    beforeChargeTitle: "I-charge ang lahat",
    beforeChargeBody:
      "Telepono, power bank, at flashlight. Kapag nawalan ng kuryente, wala nang pagkakataon.",

    duringHeading: "Habang may baha",
    duringWadeTitle: "Huwag lumusong sa baha",
    duringWadeBody:
      "Anim na pulgada ng umaagos na tubig ay sapat na para matumba ka. Hindi mo nakikita ang bukas na manhole, ang kable, o kung gaano na kalalim.",
    duringPowerTitle: "Patayin ang kuryente",
    duringPowerBody:
      "Ibaba ang main switch bago pumasok ang tubig sa loob ng bahay. Huwag hahawak ng anumang de-kuryente habang basa ang paa.",
    duringClimbTitle: "Umakyat, huwag tumawid",
    duringClimbBody:
      "Kung tumataas na ang tubig, umakyat sa mas mataas na palapag o sa bubong. Huwag piliting tumawid sa umaagos na tubig para makarating sa ibang lugar.",
    duringCallTitle: "Humingi ng tulong sa mga tumutugon",
    duringCallBody:
      "Tumawag sa 911 o sa inyong barangay disaster desk. Ang Antas ay hindi nagpapadala ng rescue at walang nakabantay dito - ang mga numerong nasa itaas ang umaabot sa taong makakasagip.",

    footer:
      "Pangkalahatan ang gabay na ito. Ang barangay at ang PAGASA ang may opisyal na babala at utos na lumikas para sa inyong lugar.",
  },
  {
    metaTitle: "Flood Guide - Antas",
    metaDescription:
      "What to do before, during, and after a flood. Including the numbers to call.",

    title: "Are you ready?",
    // "Nobody is watching this" is kept, and kept blunt. It is the sentence the
    // whole page is built around; softening it to "this is not a monitored
    // service" would let somebody read it as a service that is merely slow.
    lede: "Antas tells you how deep the water is. It does not send rescue, and nobody is watching it. Here is what to do - and the numbers to call.",

    hotlinesHeading: "Numbers that reach a person",
    role911:
      "National emergency hotline - police, fire, medical, rescue. This is the one to call if somebody is in danger now.",
    // Says plainly that this is not the fast route to a boat. The card sits
    // below 911 and is drawn quietly for the same reason - see `emphasis`.
    roleNdrrmc:
      "National disaster office - coordinates the response and gives information. It is not the fastest route to rescue; 911 and your barangay are faster.",
    noLocalNumbers:
      "The numbers above are national. No barangay or local DRRMO number has been added here yet. Find your barangay's number and keep it before you need it.",

    goBagHeading: "Go bag - pack it before anything happens",
    goBagComplete: "Your go bag is complete.",
    goBagProgress: (done: number, total: number) => `${done} of ${total} packed.`,

    goBagWaterTitle: "Water and food",
    goBagWaterBody:
      "Enough for three days. Choose what needs no cooking - tinned food, biscuits, bottled water.",
    goBagLightTitle: "Flashlight and radio",
    goBagLightBody:
      "With spare batteries. A radio is more dependable than a phone signal once the water rises.",
    goBagMedicineTitle: "Medicine and first aid",
    goBagMedicineBody:
      "Alcohol, bandages, and the regular medicines of everyone in the house.",
    goBagPapersTitle: "Important documents",
    goBagPapersBody:
      "Sealed in plastic. IDs, land titles, birth certificates, and a copy of the numbers above.",

    beforeHeading: "Before a flood",
    beforeNewsTitle: "Listen to official news",
    beforeNewsBody:
      "PAGASA and your barangay are the ones who speak about evacuation. Antas tells you how deep the water is - it does not issue warnings and it does not order anyone to leave.",
    beforeRouteTitle: "Know the way out",
    beforeRouteBody:
      "Work out now where the nearest evacuation centre is and which roads do not flood easily. Do not wait until it is dark and the water is already over the road.",
    beforeLiftTitle: "Lift your things",
    beforeLiftBody:
      "Move appliances and papers somewhere high. Clear the drains and the roof before the heavy rain arrives.",
    beforeChargeTitle: "Charge everything",
    beforeChargeBody:
      "Phone, power bank, and flashlight. Once the power goes, there is no second chance.",

    duringHeading: "During a flood",
    duringWadeTitle: "Do not wade into floodwater",
    // Six inches, and the reason. The hazard is that you cannot see what is
    // under it, and that must survive translation intact.
    duringWadeBody:
      "Six inches of moving water is enough to knock you off your feet. You cannot see the open manhole, the live cable, or how deep it has become.",
    duringPowerTitle: "Cut the power",
    duringPowerBody:
      "Switch off the mains before water gets inside the house. Never touch anything electrical while your feet are wet.",
    duringClimbTitle: "Climb, do not cross",
    duringClimbBody:
      "If the water is rising, go up to a higher floor or the roof. Do not force your way across moving water to get somewhere else.",
    duringCallTitle: "Ask responders for help",
    duringCallBody:
      "Call 911 or your barangay disaster desk. Antas does not send rescue and nobody is watching it - the numbers above are what reach a person who can help.",

    footer:
      "This guide is general. Your barangay and PAGASA issue the official warnings and evacuation orders for your area.",
  },
);

/**
 * The go bag, as ids rather than four repeated pairs of keys.
 *
 * `id` is what `localStorage` remembers, and it is deliberately NOT the title.
 * The saved list used to hold Tagalog titles, so translating them would have
 * silently emptied every packed bag the moment somebody switched language - the
 * checklist quietly forgetting what you packed, on the page most likely to be
 * read with no signal. Ids never change; only the words do.
 */
export const GO_BAG_IDS = ["water", "light", "medicine", "papers"] as const;

export type GoBagId = (typeof GO_BAG_IDS)[number];
