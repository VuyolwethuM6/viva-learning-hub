import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  initializeAnalytics,
  trackAnalyticsEvent,
  trackPageView,
} from "@/lib/analytics";

export default function Analytics() {
  const location = useLocation();

  useEffect(() => {
    if (
      location.pathname.startsWith("/admin") ||
      location.pathname.startsWith("/parent") ||
      location.pathname.startsWith("/tutor")
    )
      return;
    initializeAnalytics();
    trackPageView(location.pathname, document.title);
  }, [location.pathname]);

  useEffect(() => {
    const trackLink = (event: MouseEvent) => {
      if (
        window.location.pathname.startsWith("/admin") ||
        window.location.pathname.startsWith("/parent") ||
        window.location.pathname.startsWith("/tutor")
      )
        return;
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
        trackAnalyticsEvent("lead_cta_click", {
          destination: href.includes("calendar") ? "booking" : "enrollment",
        });
      } else {
        const url = new URL(href, window.location.origin);
        if (/^\/(?:materials|download)\/.*\.pdf$/i.test(url.pathname)) {
          trackAnalyticsEvent("resource_download");
        } else if (url.origin === window.location.origin) {
          trackAnalyticsEvent("navigation_click", {
            destination: url.pathname,
          });
        } else {
          trackAnalyticsEvent("outbound_link_click", {
            destination: url.hostname,
          });
        }
      }
    };

    document.addEventListener("click", trackLink);
    return () => document.removeEventListener("click", trackLink);
  }, []);

  return null;
}
