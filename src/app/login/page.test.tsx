import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signInWithOtp = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithOtp },
  })),
}));

let searchParamsValue = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsValue,
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    searchParamsValue = new URLSearchParams();
  });

  it("calls signInWithOtp with the typed email and a redirect ending in /auth/confirm", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(
      screen.getByRole("button", { name: /send sign-in link/i }),
    );

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1));
    const [args] = signInWithOtp.mock.calls[0];
    expect(args.email).toBe("user@example.com");
    expect(args.options.emailRedirectTo).toMatch(/\/auth\/confirm$/);
  });

  it("renders the Filipino failure message inside role=alert on error", async () => {
    signInWithOtp.mockResolvedValue({ error: { message: "rate limited" } });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(
      screen.getByRole("button", { name: /send sign-in link/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Hindi naipadala ang link. Subukan ulit.",
    );
  });

  it("replaces the form with the check-your-email copy on success", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(
      screen.getByRole("button", { name: /send sign-in link/i }),
    );

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("renders the explanation for the error query parameter", () => {
    searchParamsValue = new URLSearchParams({ error: "expired_link" });
    render(<LoginPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Paso na ang link o nagamit na. Humingi ng bago.",
    );
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolveSignIn: (value: { error: null }) => void = () => {};
    signInWithOtp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    const button = screen.getByRole("button", { name: /send sign-in link/i });
    await user.click(button);

    expect(button).toBeDisabled();

    resolveSignIn({ error: null });
    await screen.findByText(/check your email/i);
  });
});
