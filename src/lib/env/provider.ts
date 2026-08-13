/**
 * `null` means "could not find out". It is never zero, and never evidence
 * against a signal - see the scorer's handling of `environmentUnknown`.
 */
export interface EnvReading {
  rainfall24hMm: number | null;
  elevationM: number | null;
  surroundingElevationM: number | null;
}

export interface EnvProvider {
  read(lat: number, lon: number): Promise<EnvReading>;
}

export const UNAVAILABLE_READING: EnvReading = {
  rainfall24hMm: null,
  elevationM: null,
  surroundingElevationM: null,
};
