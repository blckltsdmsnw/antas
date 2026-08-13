import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportPage from "./page";
import { submitReport } from "@/app/actions/submit-report";

vi.mock("@/app/actions/submit-report", () => ({
  submitReport: vi.fn(),
}));

const mockedSubmitReport = vi.mocked(submitReport);

type GeolocationSuccessCallback = (position: GeolocationPosition) => void;
type GeolocationErrorCallback = (error: GeolocationPositionError) => void;

const getCurrentPositionMock =
  vi.fn<
    (
      success: GeolocationSuccessCallback,
      error?: GeolocationErrorCallback,
    ) => void
  >();

function makePosition(
  overrides: Partial<GeolocationCoordinates> = {},
): GeolocationPosition {
  return {
    coords: {
      latitude: 14.65,
      longitude: 121.1,
      accuracy: 20,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return this;
      },
      ...overrides,
    },
    timestamp: Date.now(),
    toJSON() {
      return this;
    },
  } as GeolocationPosition;
}

beforeEach(() => {
  vi.clearAllMocks();

  Object.defineProperty(navigator, "geolocation", {
    value: {
      getCurrentPosition: getCurrentPositionMock,
    },
    configurable: true,
    writable: true,
  });
});

describe("ReportPage", () => {
  it("renders the heading and the slider at its default level", () => {
    render(<ReportPage />);

    expect(
      screen.getByRole("heading", { name: "Gaano kalalim ang tubig?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hanggang tuhod")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("submits the depth and geolocation coordinates, then shows the thank-you message", async () => {
    const user = userEvent.setup();
    getCurrentPositionMock.mockImplementation((success) => {
      success(makePosition({ latitude: 14.65, longitude: 121.1, accuracy: 15 }));
    });
    mockedSubmitReport.mockResolvedValue({ ok: true, warnings: [] });

    render(<ReportPage />);
    await user.click(screen.getByRole("button", { name: "I-report" }));

    await waitFor(() => {
      expect(mockedSubmitReport).toHaveBeenCalledWith({
        depth: "knee",
        lat: 14.65,
        lon: 121.1,
        gpsAccuracyM: 15,
      });
    });

    expect(
      await screen.findByText("Salamat. Naitala na ang report mo."),
    ).toBeInTheDocument();
  });

  it("shows the no_location message and never calls submitReport when geolocation fails", async () => {
    const user = userEvent.setup();
    getCurrentPositionMock.mockImplementation((_success, error) => {
      error?.({
        code: 1,
        message: "User denied geolocation",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    });

    render(<ReportPage />);
    await user.click(screen.getByRole("button", { name: "I-report" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Buksan ang location para makapag-report.");
    expect(mockedSubmitReport).not.toHaveBeenCalled();
  });

  it("shows the outside_pilot_area message and keeps the form visible for retry", async () => {
    const user = userEvent.setup();
    getCurrentPositionMock.mockImplementation((success) => {
      success(makePosition());
    });
    mockedSubmitReport.mockResolvedValue({
      ok: false,
      errors: ["outside_pilot_area"],
    });

    render(<ReportPage />);
    await user.click(screen.getByRole("button", { name: "I-report" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Sa ngayon, Metro Manila lang ang saklaw ng Antas.",
    );
    expect(
      screen.getByRole("button", { name: "I-report" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("disables the button while the request is in flight", async () => {
    let resolveGeolocation: (() => void) | undefined;
    getCurrentPositionMock.mockImplementation((success) => {
      resolveGeolocation = () => success(makePosition());
    });
    mockedSubmitReport.mockResolvedValue({ ok: true, warnings: [] });

    render(<ReportPage />);
    const button = screen.getByRole("button", { name: "I-report" });

    fireEvent.click(button);

    // Waiting on GPS and waiting on the server are separate waits, and on a bad
    // signal the first one is the long one. Saying "Ipinapadala..." during it
    // would claim the report had been sent when it had not.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Hinahanap ang lokasyon..." }),
      ).toBeDisabled();
    });

    resolveGeolocation?.();

    await waitFor(() => {
      expect(
        screen.getByText("Salamat. Naitala na ang report mo."),
      ).toBeInTheDocument();
    });
  });

  it("asks for confirmation instead of submitting a wildly imprecise fix", async () => {
    const user = userEvent.setup();
    // What a desktop browser with no GPS actually returns: an IP-derived guess.
    getCurrentPositionMock.mockImplementation((success) => {
      success(makePosition({ accuracy: 100_000 }));
    });

    render(<ReportPage />);
    await user.click(screen.getByRole("button", { name: "I-report" }));

    expect(
      await screen.findByRole("heading", { name: "Malabo ang lokasyon mo" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/100 km/)).toBeInTheDocument();
    expect(mockedSubmitReport).not.toHaveBeenCalled();
  });

  it("submits the imprecise fix when the reporter says the place is right", async () => {
    const user = userEvent.setup();
    getCurrentPositionMock.mockImplementation((success) => {
      success(makePosition({ latitude: 14.5, longitude: 121.05, accuracy: 4000 }));
    });
    mockedSubmitReport.mockResolvedValue({ ok: true, warnings: [] });

    render(<ReportPage />);
    await user.click(screen.getByRole("button", { name: "I-report" }));
    await user.click(
      await screen.findByRole("button", { name: "Ituloy — tama ang lugar" }),
    );

    // The reporter's judgement wins: the fix goes through unchanged, accuracy
    // included, so the moderator sees the same uncertainty they did.
    await waitFor(() => {
      expect(mockedSubmitReport).toHaveBeenCalledWith({
        depth: "knee",
        lat: 14.5,
        lon: 121.05,
        gpsAccuracyM: 4000,
      });
    });
    expect(
      await screen.findByText("Salamat. Naitala na ang report mo."),
    ).toBeInTheDocument();
  });

  it("returns to the form when the reporter cancels", async () => {
    const user = userEvent.setup();
    getCurrentPositionMock.mockImplementation((success) => {
      success(makePosition({ accuracy: 100_000 }));
    });

    render(<ReportPage />);
    await user.click(screen.getByRole("button", { name: "I-report" }));
    await user.click(await screen.findByRole("button", { name: "Kanselahin" }));

    expect(
      screen.getByRole("heading", { name: "Gaano kalalim ang tubig?" }),
    ).toBeInTheDocument();
    expect(mockedSubmitReport).not.toHaveBeenCalled();
  });
});
