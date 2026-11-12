import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Contact from "@/pages/Contact";
import PhysicalScience from "@/pages/PhysicalScience";

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("purposeful contact and enrollment navigation", () => {
  it("offers contact choices without automatically opening WhatsApp", () => {
    render(<Contact />);
    expect(screen.getByRole("heading", { name: "Contact Viva Tutorials", level: 1 })).toBeInTheDocument();
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("link", { name: "+27 73 391 3206" })).toHaveAttribute("href", "tel:+27733913206");
    expect(main.getByRole("link", { name: "Chat on WhatsApp" })).toHaveAttribute("target", "_blank");
    expect(main.getByRole("link", { name: "Chat on WhatsApp" }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    expect(main.getByRole("link", { name: "Enrol now" })).toHaveAttribute("href", "/enroll");
    expect(main.getAllByRole("link", { name: "info@vivatutorials.co.za" })[0]).toHaveAttribute("href", "mailto:info@vivatutorials.co.za");
    for (const landmark of [screen.getByRole("banner"), screen.getByRole("contentinfo")]) {
      expect(within(landmark).getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/contact");
      expect(landmark.querySelector('a[href*="wa.me"]')).toBeNull();
    }
  });

  it("takes subject enrollment directly to the existing enrollment form", () => {
    render(<PhysicalScience />);
    expect(screen.getByRole("link", { name: "Enrol now" })).toHaveAttribute("href", "/enroll");
    expect(document.querySelector('a[href*="wa.me"]')).toBeNull();
  });

  it("serves the contact page on Vercel instead of its former permanent WhatsApp redirect", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.redirects.some((entry: { source: string }) => entry.source === "/contact")).toBe(false);
    expect(config.rewrites).toContainEqual({ source: "/contact", destination: "/contact/index.html" });
    const metadata = JSON.parse(readFileSync("src/lib/pageMetadata.json", "utf8"));
    expect(metadata["/contact"].title).toContain("Contact Viva Tutorials");
  });
});
