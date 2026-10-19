const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
const consentKey = "viva-analytics-consent";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsParameters = Record<string, string | number | boolean>;

export function hasAnalyticsConsent() {
  return typeof window !== "undefined" && window.localStorage.getItem(consentKey) === "granted";
}

export function saveAnalyticsConsent(granted: boolean) {
  window.localStorage.setItem(consentKey, granted ? "granted" : "denied");
}

export function initializeAnalytics() {
  if (!measurementId || !hasAnalyticsConsent()) return;

  if (!window.dataLayer) {
    window.dataLayer = [];
  }

  if (!window.gtag) {
    window.gtag = (...args) => {
      window.dataLayer?.push(args);
    };

    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
    });
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
    });

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
}

export function trackPageView(path: string, title: string) {
  if (!measurementId || !hasAnalyticsConsent()) return;

  initializeAnalytics();
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_title: title,
    page_location: `${window.location.origin}${path}`,
  });
}

export function trackAnalyticsEvent(name: string, parameters: AnalyticsParameters = {}) {
  if (!measurementId || !hasAnalyticsConsent()) return;

  initializeAnalytics();
  window.gtag?.("event", name, parameters);
}

export function trackSiteClick(eventName: string, parameters: AnalyticsParameters = {}) {
  trackAnalyticsEvent(eventName, parameters);
}