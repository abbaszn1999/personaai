export interface AppSettings {
  general: {
    accountName: string;
    defaultWorkspaceId: string | null;
    locale: string;
  };
  wearable: {
    units: "cm" | "inches";
    imageStyle: "realistic" | "editorial" | "flat-lay";
    fitConfidenceThreshold: number;
  };
  unwearable: {
    greetingMessage: string;
    maxRecommendations: number;
    enableQuickReplies: boolean;
  };
  branding: {
    agentName: string;
    primaryColor: string;
    logoUrl: string | null;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    accountName: "My ShopAgent Account",
    defaultWorkspaceId: null,
    locale: "en",
  },
  wearable: {
    units: "cm",
    imageStyle: "realistic",
    fitConfidenceThreshold: 75,
  },
  unwearable: {
    greetingMessage: "Hi! I'm your AI shopping assistant. How can I help you today?",
    maxRecommendations: 3,
    enableQuickReplies: true,
  },
  branding: {
    agentName: "Maya",
    primaryColor: "#f76d01",
    logoUrl: null,
  },
};

export const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
];

export const BRAND_COLOR_PRESETS = [
  "#f76d01", // Autommerce orange (default brand)
  "#c40000", // brand red
  "#400095", // deep purple
  "#6b358d", // purple
  "#79081d", // wine
  "#c8a8d2", // lavender
  "#10b981", // emerald
  "#0f172a", // slate dark
];
