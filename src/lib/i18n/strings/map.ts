import { dict } from "../dict";

/**
 * The map screen: the legend, search, the weather strip, and the two notices
 * that say the data is old or missing.
 *
 * The offline sentences are the safety-critical ones here. They must always
 * state the AGE, never merely "offline" - telling somebody the network is down
 * does not tell them the pin under their thumb is two hours old, and that
 * second fact is the one deciding whether they walk down a street. Every one of
 * them takes the number as an argument for exactly that reason: an English line
 * that quietly dropped it would be a working-looking sentence that had lost the
 * only part that mattered.
 */
export const map = dict(
  {
    legendLabel: "Kulay ng lalim ng tubig",
    legendTitle: "Lalim ng tubig",
    legendDarkerWorse: "Mas madilim, mas malala.",

    depthAnkle: "Bukong-bukong",
    depthKnee: "Tuhod",
    depthWaist: "Baywang",
    depthChest: "Dibdib",
    depthAboveHead: "Lampas sa ulo",

    depthAnkleFull: "Hanggang bukong-bukong",
    depthKneeFull: "Hanggang tuhod",
    depthWaistFull: "Hanggang baywang",
    depthChestFull: "Hanggang dibdib",
    depthAboveHeadFull: "Lampas ulo",

    depthRangeUp: (min: number) => `${min} cm pataas`,
    depthRange: (min: number, max: number) => `${min}–${max} cm`,

    // MMDA Flood Gauge System's three vehicle-passability categories - see
    // `lib/passability/mmda.ts` for the inch ranges and the straddle rule.
    passPATV: "Madaanan ng lahat ng sasakyan",
    passNPLV: "Hindi madaanan ng maliliit na sasakyan",
    passNPATV: "Hindi madaanan ng anumang sasakyan",
    passSource: "Batay sa MMDA Flood Gauge System",
    passNotForWalking:
      "Hindi ito gabay sa naglalakad. Delikado ang umaagos na tubig kahit mababa.",

    pinLabel: (depth: string, hasPhoto: boolean) =>
      `${depth}${hasPhoto ? ", may larawan" : ""}`,
    clusterLabel: (count: number, deepest: string) =>
      `${count} report dito, pinakamalalim: ${deepest}. Pindutin para lakihan.`,

    searchLabel: "Maghanap ng lugar",
    searchPlaceholder: "Maghanap ng lugar o barangay",
    searchClear: "Burahin ang hinahanap",
    searchFailed: "Hindi makahanap ngayon. Subukan ulit.",
    searchEmpty: "Walang tugma.",

    locateOff: "Naka-off ang lokasyon",
    locateFailed: "Hindi makuha ang lokasyon",
    locate: "Hanapin ang kinaroroonan ko",

    weatherAsk: "Panahon sa lugar ko",
    weatherLoading: "Kinukuha ang panahon...",
    weatherRain: (mm: number) => `${mm} mm sa 3 oras`,
    weatherClear: "Maaliwalas",
    weatherCloudy: "Maulap",
    weatherFog: "Mahamog",
    weatherDrizzle: "Ambon",
    weatherRaining: "Umuulan",
    weatherDownpour: "Malakas na ulan",
    weatherStorm: "May kulog at kidlat",

    cachedJustNow: "Walang koneksyon. Ito ang huling nakuha, ngayon lang.",
    cachedMinutes: (minutes: number) =>
      `Walang koneksyon. Ito ang huling nakuha, ${minutes} minuto na ang nakalipas.`,
    cachedHours: (hours: number) =>
      `Walang koneksyon. Ito ang huling nakuha, mahigit ${hours} oras na ang nakalipas.`,
    cachedTooOld:
      "Wala kang koneksyon at masyado nang luma ang huling nakuha, kaya hindi ito ipinapakita. Maaaring iba na ang lalim ng tubig ngayon.",
    cachedUndated:
      "Hindi alam kung kailan ito huling na-update, kaya hindi ito ipinapakita.",

    loadFailed: "Hindi ma-load ang mga report.",
    loadFailedBody:
      "Hindi ibig sabihin nito na walang baha - hindi lang namin makuha ang datos ngayon.",
    retry: "Subukan ulit",
  },
  {
    legendLabel: "Water depth colours",
    legendTitle: "Water depth",
    legendDarkerWorse: "Darker is worse.",

    depthAnkle: "Ankle",
    depthKnee: "Knee",
    depthWaist: "Waist",
    depthChest: "Chest",
    depthAboveHead: "Above the head",

    depthAnkleFull: "Ankle-deep",
    depthKneeFull: "Knee-deep",
    depthWaistFull: "Waist-deep",
    depthChestFull: "Chest-deep",
    depthAboveHeadFull: "Above the head",

    depthRangeUp: (min: number) => `${min} cm and above`,
    depthRange: (min: number, max: number) => `${min}–${max} cm`,

    passPATV: "Passable to all vehicles",
    passNPLV: "Not passable to light vehicles",
    passNPATV: "Not passable to any vehicle",
    passSource: "Based on the MMDA Flood Gauge System",
    passNotForWalking:
      "This is not guidance for people on foot. Moving water is dangerous even when shallow.",

    pinLabel: (depth: string, hasPhoto: boolean) =>
      `${depth}${hasPhoto ? ", has a photo" : ""}`,
    clusterLabel: (count: number, deepest: string) =>
      `${count} reports here, deepest: ${deepest}. Press to zoom in.`,

    searchLabel: "Search for a place",
    searchPlaceholder: "Search for a place or barangay",
    searchClear: "Clear the search",
    searchFailed: "Cannot search right now. Try again.",
    searchEmpty: "No matches.",

    locateOff: "Location is off",
    locateFailed: "Could not get your location",
    locate: "Find where I am",

    weatherAsk: "Weather where I am",
    weatherLoading: "Getting the weather...",
    weatherRain: (mm: number) => `${mm} mm in 3 hours`,
    weatherClear: "Clear",
    weatherCloudy: "Cloudy",
    weatherFog: "Foggy",
    weatherDrizzle: "Drizzle",
    weatherRaining: "Raining",
    weatherDownpour: "Heavy rain",
    weatherStorm: "Thunder and lightning",

    // The age leads in every one of these. Not "You are offline (2 hours ago)" -
    // the age is the sentence and the connection is the aside.
    cachedJustNow: "No connection. This is the last data fetched, just now.",
    cachedMinutes: (minutes: number) =>
      `No connection. This is the last data fetched, ${minutes} minutes ago.`,
    cachedHours: (hours: number) =>
      `No connection. This is the last data fetched, over ${hours} hours ago.`,
    cachedTooOld:
      "You have no connection and the last data fetched is too old, so it is not being shown. The water may be a different depth now.",
    cachedUndated:
      "There is no record of when this was last updated, so it is not being shown.",

    loadFailed: "The reports could not be loaded.",
    // The whole point of this line: an empty map is a claim about the world, and
    // this is what stops it being read as "no flooding here".
    loadFailedBody:
      "This does not mean there is no flooding - we simply cannot fetch the data right now.",
    retry: "Try again",
  },
);
