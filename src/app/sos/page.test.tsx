import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import SosPage from "./page";
import { submitSos } from "@/app/actions/submit-sos";
import { PULSE_SENT } from "@/lib/haptics/pulse";

/**
 * What this file is for: the confirming buzz must fire when, and only when, a
 * signal actually reached the database.
 *
 * That rule cannot be checked in `HoldToConfirm` - the component has no idea
 * whether the submission it triggered succeeded - and it cannot be checked by
 * looking at the screen either, because a buzz leaves no trace there. It is the
 * same class of harm as the notifications refused in `design.md` §12: telling
 * somebody in rising water that their call for help went out, when it did not,
 * makes them wait instead of climbing or dialling 911.
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInAnonymously: vi.fn(),
  upload: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/app/actions/submit-sos", () => ({ submitSos: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      signInAnonymously: mocks.signInAnonymously,
    },
    storage: { from: () => ({ upload: mocks.upload }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    }),
  }),
}));

/** Subscribes to realtime against a client this file has replaced. */
vi.mock("@/components/SignalStatus", () => ({ SignalStatus: () => null }));

/** The real one opens a camera. Here it just hands the page a file. */
vi.mock("@/components/PhotoCapture", () => ({
  PhotoCapture: ({ onCapture }: { onCapture: (file: File) => void }) => (
    <button
      type="button"
      onClick={() =>
        onCapture(new File(["photo"], "sos.jpg", { type: "image/jpeg" }))
      }
    >
      kunan
    </button>
  ),
}));

const mockedSubmitSos = vi.mocked(submitSos);

/**
 * A substring, not the whole label. The hold button's accessible name is its
 * own text *plus* the progress bar's aria-label nested inside it, so an exact
 * match here would break the day that announcement is reworded - which has
 * nothing to do with anything this file is testing.
 */
const HOLD_LABEL = /Pindutin nang 3 segundo/;

function stubVibrate() {
  const spy = vi.fn<(pattern: number | number[]) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", {
    value: spy,
    configurable: true,
    writable: true,
  });
  return spy;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.upload.mockResolvedValue({ error: null });
  // A number already on file, so the phone prompt stays out of the way.
  mocks.maybeSingle.mockResolvedValue({ data: { phone: "+639171234567" } });

  Object.defineProperty(navigator, "geolocation", {
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: {
            latitude: 14.65,
            longitude: 121.1,
            accuracy: 15,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON() {
              return this;
            },
          },
          timestamp: Date.now(),
          toJSON() {
            return this;
          },
        } as GeolocationPosition),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "vibrate");
});

/** Photo, then the full three-second hold. Timers go back to real afterwards
 *  so the awaited submission chain can settle. */
function holdToSend() {
  fireEvent.click(screen.getByRole("button", { name: "kunan" }));
  fireEvent.pointerDown(screen.getByRole("button", { name: HOLD_LABEL }));
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  vi.useRealTimers();
}

describe("SOS haptics", () => {
  it("buzzes the sent pattern once the signal is written", async () => {
    const buzz = stubVibrate();
    mockedSubmitSos.mockResolvedValue({ ok: true, signalId: "sig-1" });

    render(<SosPage />);
    holdToSend();

    expect(
      await screen.findByText("Naipadala na ang SOS mo."),
    ).toBeInTheDocument();
    expect(buzz).toHaveBeenCalledWith([...PULSE_SENT]);
  });

  it("stays silent when the insert is rejected", async () => {
    const buzz = stubVibrate();
    mockedSubmitSos.mockResolvedValue({ ok: false, errors: ["insert_failed"] });

    render(<SosPage />);
    holdToSend();

    // Proof the run actually reached the decision point. Without this the
    // assertion below would also pass on a page that never submitted at all.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(buzz).not.toHaveBeenCalledWith([...PULSE_SENT]);
    // The hold ramp ran and was then cancelled, and that is all the phone was
    // asked for. Nothing claimed the signal went anywhere.
    for (const [pattern] of buzz.mock.calls) {
      expect(Array.isArray(pattern) || pattern === 0).toBe(true);
    }
  });

  it("stays silent when the photo upload fails", async () => {
    const buzz = stubVibrate();
    mocks.upload.mockResolvedValue({ error: { message: "storage down" } });

    render(<SosPage />);
    holdToSend();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockedSubmitSos).not.toHaveBeenCalled();
    expect(buzz).not.toHaveBeenCalledWith([...PULSE_SENT]);
  });

  it("sends normally on a phone with no vibration at all", async () => {
    // iOS Safari. Nothing here may depend on the buzz having worked.
    mockedSubmitSos.mockResolvedValue({ ok: true, signalId: "sig-2" });

    render(<SosPage />);
    holdToSend();

    expect(
      await screen.findByText("Naipadala na ang SOS mo."),
    ).toBeInTheDocument();
  });
});
