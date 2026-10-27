import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { FaWhatsapp } from "react-icons/fa";
import "./portal-chrome.css";
import { whatsappHref } from "@/lib/whatsapp";
export function WhatsAppButton({
  message,
  children = "WhatsApp Viva",
  className = "",
}: {
  message?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={`viva-whatsapp ${className}`}
      href={whatsappHref(message)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <FaWhatsapp aria-hidden="true" size={21} />
      {children}
    </a>
  );
}
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
