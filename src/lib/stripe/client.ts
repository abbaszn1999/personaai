import Stripe from "stripe";
import { getStripeServerConfig } from "./config";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  stripeClient = new Stripe(getStripeServerConfig().secretKey, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: {
      name: "Autommerce",
      version: "0.1.0",
    },
  });
  return stripeClient;
}
