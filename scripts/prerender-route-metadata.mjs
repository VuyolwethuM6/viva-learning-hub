import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createServer } from "vite";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const siteUrl = "https://vivatutorials.co.za";
const pages = JSON.parse(await readFile(resolve(projectRoot, "src/lib/pageMetadata.json"), "utf8"));
const template = await readFile(resolve(projectRoot, "dist/index.html"), "utf8");
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  ssr: { noExternal: ["react-helmet-async"] },
});
const { default: App } = await vite.ssrLoadModule("/src/App.tsx");

const escapeAttribute = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const replaceTag = (html, expression, replacement) => {
  if (!expression.test(html)) throw new Error(`Expected metadata tag was not found: ${expression}`);
  return html.replace(expression, replacement);
};

const renderRoute = (route) => new Promise((resolveHtml, reject) => {
  const helmetContext = {};
  const chunks = [];
  const output = new PassThrough();
  output.on("data", (chunk) => chunks.push(chunk));
  output.on("end", () => resolveHtml({
    body: Buffer.concat(chunks).toString("utf8"),
    head: helmetContext.helmet?.script?.toString() ?? "",
  }));

  let didError = false;
  let controller;
  controller = renderToPipeableStream(React.createElement(App, { staticLocation: route, helmetContext }), {
    onAllReady() {
      controller.pipe(output);
    },
    onShellError(error) {
      reject(error);
    },
    onError(error) {
      didError = true;
      console.error(error);
    },
  });
  output.on("error", reject);
  output.on("end", () => {
    if (didError && chunks.length === 0) reject(new Error(`Failed to render ${route}`));
  });
});

try {
for (const [route, page] of Object.entries(pages)) {
  const canonical = `${siteUrl}${route}`;
  const title = escapeAttribute(page.title);
  const description = escapeAttribute(page.description);
  let html = template;

  html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = replaceTag(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${description}" />`);
  html = replaceTag(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`);
  html = replaceTag(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}" />`);
  html = replaceTag(html, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}" />`);
  html = replaceTag(html, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}" />`);
  html = replaceTag(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}" />`);
  html = replaceTag(html, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}" />`);
  html = replaceTag(html, /<meta name="robots"[^>]*>/, `<meta name="robots" content="${page.indexable === false ? "noindex,follow" : "index,follow"}" />`);

  const rendered = await renderRoute(route);
  html = html.replace('<div id="root"></div>', `<div id="root">${rendered.body}</div>`);
  if (rendered.head) html = html.replace("</head>", `${rendered.head}</head>`);

  const outputPath = route === "/" ? resolve(projectRoot, "dist/index.html") : resolve(projectRoot, "dist", route.slice(1), "index.html");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
}

let notFoundHtml = template;
notFoundHtml = replaceTag(notFoundHtml, /<title>[\s\S]*?<\/title>/, "<title>Page Not Found | Viva Tutorials</title>");
notFoundHtml = replaceTag(notFoundHtml, /<meta name="description"[^>]*>/, '<meta name="description" content="The page you requested could not be found." />');
notFoundHtml = replaceTag(notFoundHtml, /<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex,follow" />');
notFoundHtml = notFoundHtml.replace(/\s*<link rel="canonical"[^>]*>/, "");
notFoundHtml = notFoundHtml.replace('<div id="root"></div>', `<div id="root">${(await renderRoute("/__not_found__")).body}</div>`);
await writeFile(resolve(projectRoot, "dist/404.html"), notFoundHtml);

console.log(`Prerendered ${Object.keys(pages).length} routes and a noindex 404 page.`);
} finally {
  await vite.close();
}