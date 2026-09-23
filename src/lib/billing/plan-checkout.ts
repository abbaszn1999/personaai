const LIVE_SUBSCRIPTION_MESSAGE = "An active or pending subscription already exists";
const TRIAL_USED_MESSAGE = "Trial has already been used on this account.";

export function subscriptionCheckoutBlock(input: {
  purchaseKey: string;
  trialUsed: boolean;
  hasLiveSubscription: boolean;
  hasLiveMain: boolean;
}): string | null {
  if (input.purchaseKey === "plan_trial") {
    if (input.trialUsed) return TRIAL_USED_MESSAGE;
    if (input.hasLiveSubscription) return LIVE_SUBSCRIPTION_MESSAGE;
    return null;
  }
  if (input.purchaseKey === "plan_main" && input.hasLiveMain) return LIVE_SUBSCRIPTION_MESSAGE;
  return null;
}
