// @vitest-environment node
import { createServer, type ViteDevServer } from "vite";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
let server: ViteDevServer, base: string;
const folder = ".audit-files-" + randomUUID(),
  root = resolve(folder),
  marker = "SYNTHETIC-NOT-A-SECRET";
beforeAll(async () => {
  for (const name of ["private", ".git"])
    await mkdir(resolve(root, name), { recursive: true });
  for (const file of [
    ".env.local",
    "audit.pem",
    ".git/HEAD",
    "private/example.pdf",
    "safe.txt",
  ])
    await writeFile(resolve(root, file), marker);
  server = await createServer({
    configFile: resolve("vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  base = "http://127.0.0.1:" + address.port;
}, 30000);
afterAll(async () => {
  await server?.close();
  await rm(root, { recursive: true, force: true });
});
it("rejects secret, key, Git and private-file URLs before Vite transforms, including query/raw/fs variants", async () => {
  for (const file of [
    ".env.local",
    "audit.pem",
    ".git/HEAD",
    "private/example.pdf",
  ])
    for (const path of [
      `/${folder}/${file}`,
      `/${folder}/${file}?raw`,
      `/@fs${root}/${file}?raw??`,
      `/${folder}/${file.replace(".env", "%2eenv")}?url`,
    ]) {
      const r = await fetch(base + path);
      expect(r.status, path).toBe(403);
      expect(await r.text()).not.toContain(marker);
    }
});
it("continues serving ordinary public development assets", async () => {
  const r = await fetch(base + "/" + folder + "/safe.txt");
  expect(r.status).toBe(200);
  expect(await r.text()).toContain(marker);
});
