import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { initializeAnalytics, saveAnalyticsConsent, trackAnalyticsEvent } from "@/lib/analytics";

const isConfigured = Boolean(import.meta.env.VITE_GA_MEASUREMENT_ID);

export default function AnalyticsConsent() {
  const location = useLocation();
  const [choice, setChoice] = useState<"pending" | "granted" | "denied">("pending");

  useEffect(() => {
    if (!isConfigured) {
      setChoice("denied");
      return;
    }
    const saved = window.localStorage.getItem("viva-analytics-consent");
    if (saved === "granted" || saved === "denied") setChoice(saved);
  }, []);

  useEffect(() => {
    if (choice !== "granted") return;
    initializeAnalytics();
    window.gtag?.("event", "page_view", {
      page_path: location.pathname,
      page_title: document.title,
      page_location: `${window.location.origin}${location.pathname}`,
    });
  }, [choice, location.pathname]);

  useEffect(() => {
    const openPreferences = () => {
      saveAnalyticsConsent(false);
      window.gtag?.("consent", "update", { analytics_storage: "denied" });
      setChoice("pending");
    };
    const trackLink = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("tel:")) {
        trackAnalyticsEvent("phone_click");
      } else if (href.startsWith("mailto:")) {
        trackAnalyticsEvent("email_click");
      } else if (/forms\.gle|calendar\.app\.google/.test(href)) {
        trackAnalyticsEvent("lead_cta_click", { destination: href.includes("calendar") ? "booking" : "enrollment" });
      } else {
        const url = new URL(href, window.location.origin);
        if (/^\/materials\/.*\.pdf$/i.test(url.pathname)) {
          trackAnalyticsEvent("resource_download");
        } else if (url.origin === window.location.origin) {
          trackAnalyticsEvent("navigation_click", { destination: url.pathname });
        } else {
          trackAnalyticsEvent("outbound_link_click", { destination: url.hostname });
        }
      }
    };

    window.addEventListener("viva:manage-analytics", openPreferences);
    document.addEventListener("click", trackLink);
    return () => {
      window.removeEventListener("viva:manage-analytics", openPreferences);
      document.removeEventListener("click", trackLink);
    };
  }, []);

  if (!isConfigured || choice !== "pending") return null;

  const choose = (granted: boolean) => {
    saveAnalyticsConsent(granted);
    window.gtag?.("consent", "update", { analytics_storage: granted ? "granted" : "denied" });
    setChoice(granted ? "granted" : "denied");
  };

  return (
    <aside className="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200 bg-white p-4 shadow-xl sm:p-5" aria-label="Analytics privacy choices">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm leading-6 text-slate-700">
          Viva Tutorials would like to use Google Analytics to measure site visits and improve the website. Analytics is off unless you allow it. Read our <a className="font-semibold underline" href="/privacy-policy">Privacy Policy</a>.
        </p>
        <div className="flex shrink-0 gap-3">
          <button type="button" onClick={() => choose(false)} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">Decline</button>
          <button type="button" onClick={() => choose(true)} className="min-h-11 rounded-md bg-[#7949fe] px-4 text-sm font-semibold text-white hover:bg-[#5a4ecf]">Allow analytics</button>
        </div>
      </div>
    </aside>
  );
}