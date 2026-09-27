const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
const consentKey = "viva-analytics-consent";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function hasAnalyticsConsent() {
  return typeof window !== "undefined" && window.localStorage.getItem(consentKey) === "granted";
}

export function saveAnalyticsConsent(granted: boolean) {
  window.localStorage.setItem(consentKey, granted ? "granted" : "denied");
}

export function initializeAnalytics() {
  if (!measurementId || !hasAnalyticsConsent() || window.gtag) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args) => window.dataLayer?.push(args);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

export function trackAnalyticsEvent(name: string, parameters: Record<string, string | number> = {}) {
  if (hasAnalyticsConsent()) {
    initializeAnalytics();
    window.gtag?.("event", name, parameters);
  }
}