"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { type DepthLevel } from "@/lib/depth/scale";
import { DEPTH_VAR, SEVERITY_VAR } from "@/lib/depth/presentation";
import { depthName } from "@/lib/depth/name";
import type { HazardType, Severity } from "@/lib/hazard/types";
import { hazardName, severityWord } from "@/lib/hazard/name";
import { HazardIcon } from "@/components/HazardIcon";
import { useCopy } from "@/lib/i18n/context";
import type { Copy } from "@/lib/i18n/strings";
import { reportPhotoUrl } from "@/lib/reports/photo";
import { timestampLabel } from "@/lib/time/relative";
import { hideReport } from "@/app/actions/submit-update";
import { PhoneField } from "@/components/PhoneField";
import { ResponderField } from "@/components/ResponderField";

/**
 * Your own reports.
 *
 * A report used to vanish the moment it was sent - one pin among hundreds, with
 * no way to see what you had contributed or to notice you had picked the wrong
 * depth. Asking people to volunteer information and then hiding it from them is
 * a poor deal.
 *
 * The status shown is the report's REAL status column, not an invented review
 * pipeline. Depth reports are not moderated - only SOS signals are - so the
 * three states here are the three the database actually has. Showing
 * "Pinoproseso" over a report nobody is processing would be theatre.
 */

interface MyReport {
  id: string;
  hazard_type: HazardType;
  severity: Severity;
  // Flood's own detail (0028). Null for every other hazard - see
  // `severityWord`, which carries their words instead.
  depth: DepthLevel | null;
  reported_at: string;
  photo_path: string | null;
  lat: number;
  lon: number;
  barangay: string | null;
  status: string;
}

/** The database's own three states, in the words a reporter would use. */
const STATUS_KEY: Record<string, keyof Copy["screens"]> = {
  active: "statusActive",
  flagged: "statusFlagged",
  hidden: "statusHidden",
};

type Stage = "loading" | "signed-out" | "ready" | "failed";

export default function AkoPage() {
  const copy = useCopy();
  const [stage, setStage] = useState<Stage>("loading");
  const [reports, setReports] = useState<MyReport[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [responder, setResponder] = useState<{ name: string | null; unit: string | null; barangay: string | null } | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      setStage("signed-out");
      return;
    }
    setEmail(auth.user.email ?? null);
    // An anonymous session has no email and no way back in, which changes what
    // signing out means - see the control at the bottom of this page.
    setAnonymous(auth.user.is_anonymous === true);

    // Own row only - `profiles` is scoped to `id = auth.uid()`, so this can
    // never return somebody else's number.
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, display_name, responder_unit, responder_barangay")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profile?.phone) setSavedPhone(profile.phone as string);
    setResponder({
      name: (profile?.display_name as string | null) ?? null,
      unit: (profile?.responder_unit as string | null) ?? null,
      barangay: (profile?.responder_barangay as string | null) ?? null,
    });

    const { data, error } = await supabase.rpc("my_reports");
    if (error) {
      // Same rule as the map: a failed load must not be dressed up as an empty
      // one. "You have filed nothing" and "we could not check" are different
      // sentences, and only one of them is true.
      setStage("failed");
      return;
    }

    setReports((data ?? []) as MyReport[]);
    setStage("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Two taps, not a modal.
   *
   * Removing a report is reversible in principle - the row is only hidden - but
   * not by the person doing it, so it should not happen on one stray thumb. The
   * button asks "sigurado ka?" in place rather than opening a dialogue, which
   * on a phone is both faster and harder to dismiss by accident.
   */
  const remove = useCallback(
    async (reportId: string) => {
      if (confirming !== reportId) {
        setConfirming(reportId);
        return;
      }

      setRemoving(reportId);
      const result = await hideReport(reportId);
      setRemoving(null);
      setConfirming(null);

      if (!result.ok) {
        setStage("failed");
        return;
      }
      await load();
    },
    [confirming, load],
  );

  /**
   * Signing out, which did not exist at all until now.
   *
   * That was an oversight rather than a decision, and it got worse when an SOS
   * stopped needing an account: somebody who sends one from a borrowed or
   * shared phone is left permanently signed in on a device that is not theirs,
   * with their reports - and possibly their phone number - one tab away from
   * whoever owns it.
   *
   * For an anonymous account it is IRREVERSIBLE, and the button says so before
   * doing it. There is no email to sign back in with, so leaving means losing
   * the only link to the SOS they sent and the status updates on it. That is
   * sometimes exactly what somebody wants on a borrowed phone, and it must
   * never be a surprise.
   */
  const signOut = useCallback(async () => {
    if (anonymous && !confirmingSignOut) {
      setConfirmingSignOut(true);
      return;
    }

    await createClient().auth.signOut();
    // A full reload rather than a state reset: it is the only way to be sure
    // nothing of the previous session is left rendered on a shared device.
    window.location.assign("/");
  }, [anonymous, confirmingSignOut]);

  return (
    <main className="task-page">
      <h1 className="task-title">{copy.screens.akoTitle}</h1>

      {stage === "loading" && (
        <p className="task-lede">{copy.screens.akoLoading}</p>
      )}

      {stage === "signed-out" && (
        <>
          <p className="task-lede">{copy.screens.akoSignedOut}</p>
          <Link href="/login" className="btn">
            {copy.screens.loginTitle}
          </Link>
        </>
      )}

      {stage === "failed" && (
        <>
          <p className="alert">
            <strong>{copy.screens.akoFailed}</strong> {copy.screens.akoFailedBody}
          </p>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void load()}
          >
            {copy.map.retry}
          </button>
        </>
      )}

      {stage === "ready" && (
        <>
          {/* An anonymous session has no email to show, and saying nothing at
              all leaves somebody on a borrowed phone unsure whose account they
              are looking at. */}
          <p className="task-lede">
            {email
              ? copy.screens.akoSignedInAs(email)
              : copy.screens.akoAnonymous}
          </p>

          {/* Optional, and said so plainly. A required phone number on a flood
              map is a reason not to report at all, and most people using this
              are only looking at the water - the number matters to the one
              person in a hundred who sends an SOS. */}
          <PhoneField
            title={copy.screens.akoPhoneTitle}
            note={copy.screens.akoPhoneNote}
            initial={savedPhone}
          />

          {!anonymous && responder && <ResponderField initial={responder} />}

          <h2 className="my-reports-title">{copy.screens.akoReportsTitle}</h2>

          {reports.length === 0 ? (
            <p className="task-lede">
              {copy.screens.akoNoReports}{" "}
              <Link href="/report" className="quiet-link">
                {copy.screens.akoReportLink}
              </Link>
              .
            </p>
          ) : (
            <ul className="my-reports">
              {reports.map((report) => {
                const photo = reportPhotoUrl(report.photo_path);
                return (
                  <li key={report.id} className="my-report">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="my-report-photo" src={photo} alt="" />
                    ) : (
                      <span
                        className="my-report-swatch"
                        style={{
                          background:
                            report.depth !== null
                              ? DEPTH_VAR[report.depth]
                              : SEVERITY_VAR[report.severity],
                        }}
                        aria-hidden="true"
                      />
                    )}

                    <div className="my-report-body">
                      {/* Flood renders exactly as before - same swatch, same
                          depthName. Every other hazard has no depth to show,
                          so it shows what it is and how bad instead, the same
                          branch ReportDetail already makes for the map sheet. */}
                      {report.depth !== null ? (
                        <p className="my-report-depth">
                          {depthName(report.depth, copy.map)}
                        </p>
                      ) : (
                        <>
                          <p
                            className="my-report-depth"
                            style={{ display: "flex", alignItems: "center", gap: "6px" }}
                          >
                            <HazardIcon hazard={report.hazard_type} size="sm" />
                            {hazardName(report.hazard_type, copy.hazard)}
                          </p>
                          <p className="my-report-severity">
                            {severityWord(report.hazard_type, report.severity, copy.hazard)}
                          </p>
                        </>
                      )}
                      <p className="my-report-where">
                        {report.barangay ?? copy.screens.akoUnknownPlace}
                      </p>
                      <p className="my-report-when">
                        {timestampLabel(report.reported_at, copy.screens)}
                      </p>
                    </div>

                    <div className="my-report-side">
                      <span
                        className="my-report-status"
                        data-status={report.status}
                      >
                        {STATUS_KEY[report.status]
                          ? (copy.screens[STATUS_KEY[report.status]] as string)
                          : report.status}
                      </span>

                      {/* Only while it is on the map. Offering "remove" against
                          something already removed is a button that can only
                          disappoint. */}
                      {report.status === "active" && (
                        <button
                          type="button"
                          className="my-report-remove"
                          data-confirming={confirming === report.id}
                          disabled={removing === report.id}
                          onClick={() => void remove(report.id)}
                        >
                          {confirming === report.id
                            ? copy.screens.akoSure
                            : copy.screens.akoRemove}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <section className="signout">
            <button
              type="button"
              className="signout-button"
              data-confirming={confirmingSignOut}
              onClick={() => void signOut()}
            >
              {confirmingSignOut
                ? copy.screens.akoSignOutSure
                : copy.screens.akoSignOut}
            </button>

            {anonymous && (
              // Said before the second tap, not after. Leaving an anonymous
              // session is permanent, and somebody on their own phone almost
              // certainly does not want to.
              <p className="signout-note">{copy.screens.akoSignOutNote}</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
