// @vitest-environment node
import { it, expect, vi } from "vitest";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { gateway } from "../../scripts/recruitment-clamav-gateway.mjs";
import { SignedHttpScanner } from "../../api/_lib/recruitment-scanner";
it("runs the real HTTP gateway and INSTREAM framing against a synthetic clamd protocol peer (not a malware engine)", async () => {
  let verdict = "OK",
    received = Buffer.alloc(0);
  const peer = createServer((socket) => {
    let buffer = Buffer.alloc(0),
      stream = false;
    socket.on("data", (part) => {
      buffer = Buffer.concat([buffer, part]);
      if (!stream) {
        const end = buffer.indexOf(0);
        if (end < 0) return;
        const cmd = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 1);
        if (cmd === "zVERSION") {
          socket.end(`ClamAV protocol-fixture/1/${new Date().toUTCString()}\0`);
          return;
        }
        if (cmd !== "zINSTREAM") {
          socket.destroy();
          return;
        }
        stream = true;
        received = Buffer.alloc(0);
      }
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (buffer.length < size + 4) return;
        buffer = buffer.subarray(4);
        if (!size) {
          socket.end(`stream: ${verdict}\0`);
          return;
        }
        received = Buffer.concat([received, buffer.subarray(0, size)]);
        buffer = buffer.subarray(size);
      }
    });
  });
  peer.listen(0, "127.0.0.1");
  await once(peer, "listening");
  const port = (peer.address() as { port: number }).port;
  vi.stubEnv("CLAMD_PORT", String(port));
  vi.stubEnv("CLAMD_HOST", "127.0.0.1");
  vi.stubEnv("RECRUITMENT_SCANNER_KEY", "synthetic-gateway-test-key".repeat(3));
  vi.stubEnv("RECRUITMENT_SCANNER_POLICY", "pdf-v1");
  const http = gateway();
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  vi.stubEnv(
    "RECRUITMENT_SCANNER_URL",
    `http://127.0.0.1:${(http.address() as { port: number }).port}`,
  );
  try {
    const scanner = new SignedHttpScanner(),
      bytes = Buffer.from(
        "%PDF-1.7\n" + "synthetic ".repeat(10000) + "\n%%EOF",
      );
    expect((await scanner.health()).engine).toContain("protocol-fixture");
    const context = {
      jobId: randomUUID(),
      generation: randomUUID(),
      policy: "pdf-v1",
    };
    expect((await scanner.scan(bytes, context)).verdict).toBe("clean");
    expect(received.equals(bytes)).toBe(true);
    verdict = "Synthetic.Test FOUND";
    expect((await scanner.scan(bytes, context)).verdict).toBe("infected");
    verdict = "engine unavailable ERROR";
    expect((await scanner.scan(bytes, context)).verdict).toBe("error");
  } finally {
    http.closeAllConnections();
    await new Promise<void>((r) => http.close(() => r()));
    await new Promise<void>((r) => peer.close(() => r()));
    vi.unstubAllEnvs();
  }
}, 15000);
