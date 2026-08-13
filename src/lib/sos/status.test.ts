import { describe, it, expect } from "vitest";
import {
  SOS_STATUSES,
  ACTIVE_STATUSES,
  isActiveStatus,
  canTransition,
  isSosStatus,
} from "./status";

describe("sos status", () => {
  it("lists every status", () => {
    expect(SOS_STATUSES).toEqual([
      "pending",
      "under_review",
      "confirmed",
      "dismissed",
      "resolved",
    ]);
  });

  it("treats pending, under_review and confirmed as active", () => {
    expect(ACTIVE_STATUSES).toEqual(["pending", "under_review", "confirmed"]);
  });

  it("does not treat dismissed or resolved as active", () => {
    expect(isActiveStatus("dismissed")).toBe(false);
    expect(isActiveStatus("resolved")).toBe(false);
  });

  it("allows the normal review path", () => {
    expect(canTransition("pending", "under_review")).toBe(true);
    expect(canTransition("under_review", "confirmed")).toBe(true);
    expect(canTransition("under_review", "dismissed")).toBe(true);
  });

  it("only lets a confirmed signal resolve", () => {
    expect(canTransition("confirmed", "resolved")).toBe(true);
    expect(canTransition("pending", "resolved")).toBe(false);
  });

  it("treats dismissed as terminal", () => {
    expect(canTransition("dismissed", "confirmed")).toBe(false);
    expect(canTransition("dismissed", "resolved")).toBe(false);
  });

  it("never allows a transition to itself", () => {
    expect(canTransition("pending", "pending")).toBe(false);
  });

  it("recognises valid status strings", () => {
    expect(isSosStatus("confirmed")).toBe(true);
    expect(isSosStatus("escalated")).toBe(false);
  });
});
