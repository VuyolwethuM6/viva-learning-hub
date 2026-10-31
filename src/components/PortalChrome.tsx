import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import "./portal-chrome.css";
import "./portal-design.css";
export { WhatsAppButton } from "./WhatsAppButton";
// Render outside page containers so transforms/containment on a page can never
// make a fixed mobile dock scroll with that page. Keep each portal's CSS scope.
export function PortalDock({
  scope = "admin-shell",
  children,
}: {
  scope?: string;
  children: ReactNode;
}) {
  return createPortal(
    <div className={`portal-dock-scope ${scope}`}>{children}</div>,
    document.body,
  );
}
