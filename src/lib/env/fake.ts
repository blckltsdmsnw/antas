import {
  UNAVAILABLE_READING,
  type EnvProvider,
  type EnvReading,
} from "./provider";

export function fakeEnvProvider(reading: EnvReading): EnvProvider {
  return { read: async () => reading };
}

export const unavailableEnvProvider: EnvProvider = {
  read: async () => UNAVAILABLE_READING,
};
