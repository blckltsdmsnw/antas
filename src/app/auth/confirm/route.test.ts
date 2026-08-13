import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession,
    },
  })),
}));

import { GET } from "./route";

function makeRequest(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

function locationOf(response: Response): string | null {
  return response.headers.get("location");
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
  });

  it("redirects to login with missing_code when there is no code", async () => {
    const request = makeRequest("https://example.com/auth/confirm");

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe(
      "https://example.com/login?error=missing_code",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to login with expired_link when the exchange errors", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "invalid or expired code" },
    });
    const request = makeRequest(
      "https://example.com/auth/confirm?code=stale-code",
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe(
      "https://example.com/login?error=expired_link",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("stale-code");
  });

  it("redirects to login with expired_link when exchange succeeds without a session", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const request = makeRequest(
      "https://example.com/auth/confirm?code=no-session-code",
    );

    const response = await GET(request);

    expect(locationOf(response)).toBe(
      "https://example.com/login?error=expired_link",
    );
  });

  it("redirects to /report on a successful exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
    const request = makeRequest(
      "https://example.com/auth/confirm?code=good-code",
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe("https://example.com/report");
  });
});
