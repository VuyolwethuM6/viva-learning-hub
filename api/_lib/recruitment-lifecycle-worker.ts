import { intakeRpc } from "./recruitment-intake.js";

export type LifecycleCounts = {
  interviewsReminded: number;
  offersExpired: number;
  offersReminded: number;
  onboardingReminded: number;
};

/** Called only by the existing authenticated worker endpoint. No new scheduler,
 * credentials, transport, or deployed serverless function is introduced. */
export async function recruitmentLifecycle(limit = 10) {
  return intakeRpc<LifecycleCounts>("recruitment_lifecycle_tick", {
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.trunc(limit))) : 10,
  });
}

/** Notification bodies deliberately contain no scores, notes, names, meeting
 * links, financial terms, document identifiers, or acceptance credentials. */
export function lifecycleNotification(template: string, origin: string): string | null {
  const messages: Record<string, string> = {
    selection_status: "There is an update to your recruitment application.",
    engagement_status: "There is an update to your offer or onboarding.",
    interview_reminder: "Your recruitment interview is approaching. Check the current arrangements and respond in your application workspace.",
    offer_reminder: "Your recruitment offer is approaching its deadline. Review the current offer in your application workspace.",
    offer_expired: "Your recruitment offer deadline has passed. Check the current status in your application workspace.",
    onboarding_reminder: "You have outstanding recruitment onboarding tasks. Check the current requirements in your application workspace.",
  };
  const message = messages[template];
  return message
    ? `${message}\n\nVerify your email to access your private application: ${origin}/recruitment/recover\n\nThis email does not grant staff access.`
    : null;
}
