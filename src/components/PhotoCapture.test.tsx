import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoCapture } from "./PhotoCapture";

const stop = vi.fn();
const getUserMedia = vi.fn();

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop }] } as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMedia.mockResolvedValue(fakeStream());

  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  });
});

describe("PhotoCapture", () => {
  it("does not touch the camera until asked", () => {
    render(<PhotoCapture onCapture={vi.fn()} prompt="Kumuha ng larawan" />);

    // The whole point of the resting card: opening a page must not raise a
    // permission prompt or light up the camera.
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByText("Kumuha ng larawan")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Buksan ang camera" }),
    ).toBeInTheDocument();
  });

  it("shows the note so visibility is known before the shutter, not after", () => {
    render(
      <PhotoCapture
        onCapture={vi.fn()}
        prompt="Kumuha ng larawan"
        note="Makikita ito ng lahat sa mapa."
      />,
    );

    expect(screen.getByText("Makikita ito ng lahat sa mapa.")).toBeInTheDocument();
  });

  it("opens the rear camera only on a deliberate tap", async () => {
    const user = userEvent.setup();
    render(<PhotoCapture onCapture={vi.fn()} prompt="Kumuha ng larawan" />);

    await user.click(screen.getByRole("button", { name: "Buksan ang camera" }));

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
      audio: false,
    });
    expect(
      await screen.findByRole("button", { name: "Kumuha ng larawan" }),
    ).toBeInTheDocument();
  });

  it("attaches the stream to the video element once the viewfinder renders", async () => {
    const user = userEvent.setup();
    const stream = fakeStream();
    getUserMedia.mockResolvedValue(stream);

    const { container } = render(
      <PhotoCapture onCapture={vi.fn()} prompt="Kumuha ng larawan" />,
    );
    await user.click(screen.getByRole("button", { name: "Buksan ang camera" }));

    // Regression: attaching inside the open() handler - even in a microtask -
    // runs before React commits the live stage, so the ref is still null and
    // the stream lands nowhere. Nothing throws; the viewfinder is just black
    // forever and the shutter captures a zero-by-zero frame.
    const video = await waitFor(() => {
      const el = container.querySelector("video");
      expect(el).not.toBeNull();
      return el as HTMLVideoElement;
    });
    await waitFor(() => expect(video.srcObject).toBe(stream));
  });

  it("falls back to the file picker when permission is refused", async () => {
    const user = userEvent.setup();
    getUserMedia.mockRejectedValue(new Error("NotAllowedError"));
    render(<PhotoCapture onCapture={vi.fn()} prompt="Kumuha ng larawan" />);

    await user.click(screen.getByRole("button", { name: "Buksan ang camera" }));

    // A refused camera must not be a dead end - SOS requires a photo.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Pumili ng larawan")).toBeInTheDocument();
  });

  it("releases the camera when it closes", async () => {
    const user = userEvent.setup();
    render(<PhotoCapture onCapture={vi.fn()} prompt="Kumuha ng larawan" />);

    await user.click(screen.getByRole("button", { name: "Buksan ang camera" }));
    await user.click(await screen.findByRole("button", { name: "Isara ang camera" }));

    // An indicator light left on after you leave reads as spyware, whatever
    // the truth is.
    expect(stop).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Buksan ang camera" }),
    ).toBeInTheDocument();
  });

  it("hands off to the phone's own camera in native mode", async () => {
    const onCapture = vi.fn();
    const { container } = render(
      <PhotoCapture
        onCapture={onCapture}
        prompt="Magdagdag ng larawan"
        source="native"
      />,
    );

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toBe("image/*");
    // Without capture the picker opens the gallery first, which is the wrong
    // default for "what does this street look like right now".
    expect(input.getAttribute("capture")).toBe("environment");

    const file = new File(["x"], "shot.jpg", { type: "image/jpeg" });
    await userEvent.setup().upload(input, file);
    expect(onCapture).toHaveBeenCalledWith(file);
  });

  it("never touches getUserMedia in native mode", async () => {
    const user = userEvent.setup();
    render(
      <PhotoCapture
        onCapture={vi.fn()}
        prompt="Magdagdag ng larawan"
        source="native"
      />,
    );

    await user.click(screen.getByText("Buksan ang camera"));

    // The whole point of the native hand-off: no permission prompt, no
    // in-page viewfinder, no stream to leak.
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(document.querySelector("video")).toBeNull();
  });

  it("offers a skip only when the photo is optional", async () => {
    const onSkip = vi.fn();
    const { rerender } = render(
      <PhotoCapture onCapture={vi.fn()} prompt="Kumuha ng larawan" />,
    );
    expect(screen.queryByRole("button", { name: "Laktawan" })).toBeNull();

    rerender(
      <PhotoCapture
        onCapture={vi.fn()}
        prompt="Kumuha ng larawan"
        onSkip={onSkip}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Laktawan" }));
    expect(onSkip).toHaveBeenCalled();
  });
});
