import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import pages from "@/lib/pageMetadata.json";

const siteUrl = "https://www.vivatutorials.co.za";
const logoUrl = `${siteUrl}/viva-tutorials-logo.png`;
type PageMetadata = { title: string; description: string; indexable?: boolean };

function updateMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
) {
  const selector = `meta[${attribute}="${key}"]`;
  const matches = [
    ...document.head.querySelectorAll<HTMLMetaElement>(selector),
  ];
  const element = matches.shift() ?? document.createElement("meta");
  element.setAttribute(attribute, key);
  element.content = content;
  if (!element.isConnected) document.head.appendChild(element);
  matches.forEach((duplicate) => duplicate.remove());
}

function updateCanonical(href: string) {
  const matches = [
    ...document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'),
  ];
  const element = matches.shift() ?? document.createElement("link");
  element.rel = "canonical";
  element.href = href;
  if (!element.isConnected) document.head.appendChild(element);
  matches.forEach((duplicate) => duplicate.remove());
}

export default function RouteMetadata() {
  const { pathname } = useLocation();
  const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const page = (pages as Record<string, PageMetadata>)[path];
  const isIndexable = Boolean(page && page.indexable !== false);
  const metadata =
    path === "/parent"
      ? {
          title: "Parent Portal | Viva Tutorials",
          description: "Your secure Viva Tutorials family account.",
        }
      : path === "/admin"
        ? {
            title: "Admin | Viva Tutorials",
            description: "Authorized Viva Tutorials administration.",
          }
        : (page ?? {
            title: "Page Not Found | Viva Tutorials",
            description: "The page you requested could not be found.",
          });
  const canonical = `${siteUrl}${path}`;

  useEffect(() => {
    document.title = metadata.title;
    updateMeta("name", "description", metadata.description);
    updateMeta(
      "name",
      "robots",
      ["/admin", "/parent"].includes(path)
        ? "noindex,nofollow"
        : isIndexable
          ? "index,follow"
          : "noindex,follow",
    );
    updateMeta("property", "og:type", "website");
    updateMeta("property", "og:site_name", "Viva Tutorials");
    updateMeta("property", "og:title", metadata.title);
    updateMeta("property", "og:description", metadata.description);
    updateMeta("property", "og:url", canonical);
    updateMeta("property", "og:image", logoUrl);
    updateMeta("name", "twitter:card", "summary_large_image");
    updateMeta("name", "twitter:title", metadata.title);
    updateMeta("name", "twitter:description", metadata.description);
    updateMeta("name", "twitter:image", logoUrl);
    updateCanonical(canonical);
  }, [canonical, isIndexable, metadata.description, metadata.title, path]);

  return null;
}
