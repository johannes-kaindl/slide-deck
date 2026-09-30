// Text modules for deviations (sampling plan § 5.3): one mapping used by the session notice AND
// the status line of the "Request" section — never worded twice. No obsidian import.
import { t } from "../i18n";
import type { Deviation, DeviationKind } from "../vendor/kit/sampling-profiles";

const KEY: Record<DeviationKind, string> = {
  "thinking-despite-off": "request.dev.thinkingDespiteOff",
  "empty-by-budget": "request.dev.emptyByBudget",
  "family-mismatch": "request.dev.familyMismatch",
  "family-detected": "request.dev.familyDetected",
  "rejected": "request.dev.rejected",
};

export function deviationDetail(kind: DeviationKind, detail?: string): string {
  return detail !== undefined ? t(KEY[kind], detail) : t(KEY[kind]);
}

/** Notice text: only called for deviations with `affectsResult` (contract of `createRequestSession`). */
export function deviationNotice(d: Deviation): string {
  return `${deviationDetail(d.kind, d.detail)} ${t("request.dev.seeSettings")}`;
}
