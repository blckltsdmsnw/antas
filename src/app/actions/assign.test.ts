import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { assignResponder, closeAssignment } from "./assign";

beforeEach(() => rpc.mockReset());

describe("assignResponder", () => {
  it("sends a report as incident_id and nothing as sos_id", async () => {
    rpc.mockResolvedValue({ data: "asg-1", error: null });
    const result = await assignResponder({ kind: "report", id: "r-1" }, "u-1");
    expect(rpc).toHaveBeenCalledWith("assign_responder", {
      p_incident_id: "r-1",
      p_sos_id: null,
      p_responder_id: "u-1",
    });
    expect(result).toEqual({ ok: true, assignmentId: "asg-1" });
  });

  it("sends an SOS as sos_id", async () => {
    rpc.mockResolvedValue({ data: "asg-2", error: null });
    await assignResponder({ kind: "sos", id: "s-1" }, "u-1");
    expect(rpc).toHaveBeenCalledWith("assign_responder", {
      p_incident_id: null,
      p_sos_id: "s-1",
      p_responder_id: "u-1",
    });
  });

  it("maps a permission refusal to not_allowed, anything else to failed", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "nope" } });
    expect(await assignResponder({ kind: "sos", id: "s" }, "u")).toEqual({
      ok: false, code: "not_allowed",
    });
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });
    expect(await assignResponder({ kind: "sos", id: "s" }, "u")).toEqual({
      ok: false, code: "failed",
    });
  });
});

describe("closeAssignment", () => {
  it("calls close_assignment and reports success without an id", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await closeAssignment("asg-1")).toEqual({ ok: true, assignmentId: null });
    expect(rpc).toHaveBeenCalledWith("close_assignment", { p_assignment_id: "asg-1" });
  });
});
