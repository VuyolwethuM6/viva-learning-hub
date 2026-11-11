import { useEffect, type ReactNode } from "react";
import { VivaLoader } from "./VivaLoader";
/** A public-page analytics script cannot remain alive when a private workspace mounts. */
export function RecruitmentPrivacyBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const reload =
    typeof window !== "undefined" &&
    Boolean(
      window.gtag ||
      document.querySelector('script[src*="googletagmanager.com"]'),
    );
  useEffect(() => {
    if (reload) window.location.replace(window.location.href);
  }, [reload]);
  return reload ? (
    <VivaLoader size="page" label="Opening private recruitment…" />
  ) : (
    children
  );
}
