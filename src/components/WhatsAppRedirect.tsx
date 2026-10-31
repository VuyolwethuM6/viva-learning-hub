import { useEffect } from "react";
import { whatsappHref } from "@/lib/whatsapp";
import { WhatsAppButton } from "./WhatsAppButton";

// Compatibility for old bookmarks and client-side links, without a Contact page.
export function WhatsAppRedirect() {
  useEffect(() => {
    window.location.replace(whatsappHref());
  }, []);

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center p-6">
      <WhatsAppButton />
    </main>
  );
}
