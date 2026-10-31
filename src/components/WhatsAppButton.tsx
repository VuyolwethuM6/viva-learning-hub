import type { MouseEventHandler, ReactNode } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { whatsappHref } from "@/lib/whatsapp";
import "./whatsapp-button.css";

export function WhatsAppButton({
  message,
  children = "WhatsApp Viva",
  className = "",
  onClick,
}: {
  message?: string;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <a
      className={`viva-whatsapp ${className}`}
      href={whatsappHref(message)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
    >
      <FaWhatsapp aria-hidden="true" size={21} />
      {children}
    </a>
  );
}
