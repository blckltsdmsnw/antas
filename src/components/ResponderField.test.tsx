import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const update = vi.fn();
const eq = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
    from: (table: string) =>
      table === "barangays"
        ? { select: () => ({ order: async () => ({ data: [{ name: "Malanday" }, { name: "Nangka" }] }) }) }
        : { update: update.mockReturnValue({ eq }) },
  }),
}));

import { ResponderField } from "./ResponderField";

beforeEach(() => {
  update.mockClear();
  eq.mockReset().mockResolvedValue({ error: null });
});

describe("ResponderField", () => {
  it("refuses to save without a name", async () => {
    render(<ResponderField initial={{ name: null, unit: null, barangay: null }} />);
    await userEvent.selectOptions(await screen.findByLabelText("Unit"), "bfp");
    await userEvent.click(screen.getByRole("button", { name: "I-save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ilagay ang pangalan mo.");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to save without a unit", async () => {
    render(<ResponderField initial={{ name: null, unit: null, barangay: null }} />);
    await userEvent.type(screen.getByLabelText("Pangalan"), "Ana Reyes");
    await userEvent.click(screen.getByRole("button", { name: "I-save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pumili ng unit.");
  });

  it("writes name, unit and barangay to the caller's own profile", async () => {
    render(<ResponderField initial={{ name: null, unit: null, barangay: null }} />);
    await userEvent.type(screen.getByLabelText("Pangalan"), "Ana Reyes");
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "bfp");
    await userEvent.selectOptions(await screen.findByLabelText("Barangay"), "Malanday");
    await userEvent.click(screen.getByRole("button", { name: "I-save" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        display_name: "Ana Reyes",
        responder_unit: "bfp",
        responder_barangay: "Malanday",
      }),
    );
    expect(eq).toHaveBeenCalledWith("id", "u-1");
    expect(await screen.findByText("Naka-save.")).toBeInTheDocument();
  });

  it("treats the placeholder name as empty", () => {
    // Every profile reads 'Anonymous' because nothing has ever written the
    // column. Pre-filling that word would put a name in somebody's mouth.
    render(<ResponderField initial={{ name: "Anonymous", unit: null, barangay: null }} />);
    expect(screen.getByLabelText("Pangalan")).toHaveValue("");
  });

  it("says so when the person is already registered", () => {
    render(<ResponderField initial={{ name: "Ben Cruz", unit: "police", barangay: "Nangka" }} />);
    expect(screen.getByText("Nakarehistro ka bilang responder.")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit")).toHaveValue("police");
  });
});
