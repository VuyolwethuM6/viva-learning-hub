// Real ClamAV INSTREAM gateway. Run privately behind TLS, not as a public website.
// No fake verdicts, no sample sharing, no service-role credential, no request logging.
import { createServer } from "node:http";
import { connect } from "node:net";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

export async function clamd(command, bytes, configuration = {}) {
  const host = configuration.host || process.env.CLAMD_HOST || "127.0.0.1";
  const port = Number(configuration.port || process.env.CLAMD_PORT || 3310);
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    let result = "";
    socket.setTimeout(40000, () => socket.destroy(new Error("clamd_timeout")));
    socket.on("error", reject);
    socket.on("data", (data) => {
      result += data.toString("utf8");
      if (result.length > 8192)
        socket.destroy(new Error("clamd_response_limit"));
    });
    socket.on("end", () => resolve(result.replace(/\0/g, "").trim()));
    socket.on("connect", async () => {
      socket.write(`z${command}\0`);
      if (command === "INSTREAM") {
        for (let i = 0; i < bytes.length; i += 65536) {
          const part = bytes.subarray(i, i + 65536),
            length = Buffer.alloc(4);
          length.writeUInt32BE(part.length);
          if (!socket.write(Buffer.concat([length, part])))
            await new Promise((done) => socket.once("drain", done));
        }
        socket.write(Buffer.alloc(4));
      }
    });
  });
}
export function gateway() {
  const token = process.env.RECRUITMENT_SCANNER_KEY || "",
    policy = process.env.RECRUITMENT_SCANNER_POLICY || "pdf-v1";
  if (token.length < 32) throw new Error("scanner_key_required");
  return createServer(async (req, res) => {
    const supplied = String(req.headers.authorization || "").replace(
      /^Bearer /,
      "",
    );
    if (
      supplied.length !== token.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
    ) {
      res.writeHead(403).end();
      return;
    }
    const reply = (status, data) => {
      const body = JSON.stringify(data);
      res
        .writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Scan-Signature": createHmac("sha256", token)
            .update(body)
            .digest("hex"),
        })
        .end(body);
    };
    try {
      const version = await clamd("VERSION");
      const parts = version.split("/"),
        date = new Date(parts.slice(2).join("/")).toISOString();
      const age = Date.now() - Date.parse(date);
      if (
        !version.startsWith("ClamAV ") ||
        parts.length < 3 ||
        age < -300000 ||
        age > 48 * 3600000
      )
        throw new Error("definitions_stale");
      const nonce = String(req.headers["x-scan-nonce"] || "");
      if (!/^[0-9a-f]{64}$/.test(nonce)) throw new Error("invalid_nonce");
      if (req.method === "GET" && req.url === "/health") {
        reply(200, {
          engine: parts[0],
          definitions: parts[1],
          definitionDate: date,
          policy,
          nonce,
        });
        return;
      }
      if (
        req.method !== "POST" ||
        req.url !== "/scan" ||
        req.headers["content-type"] !== "application/pdf"
      )
        throw new Error("invalid_request");
      const chunks = [];
      let count = 0;
      for await (const chunk of req) {
        count += chunk.length;
        if (count > 10485760) throw new Error("size_limit");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (
        !bytes.subarray(0, 8).toString().startsWith("%PDF-") ||
        !bytes.subarray(-2048).toString("latin1").includes("%%EOF") ||
        /\/Encrypt\b/.test(bytes.toString("latin1"))
      )
        throw new Error("uninspectable_pdf");
      const jobId = String(req.headers["x-scan-job"] || ""),
        generation = String(req.headers["x-scan-generation"] || "");
      if (
        !/^[0-9a-f-]{36}$/.test(jobId) ||
        !/^[0-9a-f-]{36}$/.test(generation) ||
        req.headers["x-scan-policy"] !== policy
      )
        throw new Error("context_mismatch");
      const result = await clamd("INSTREAM", bytes);
      const verdict = /: OK$/.test(result)
        ? "clean"
        : / FOUND$/.test(result)
          ? "infected"
          : "error";
      reply(200, {
        verdict,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
        engine: parts[0],
        definitions: parts[1],
        definitionDate: date,
        policy,
        jobId,
        generation,
        nonce,
        timestamp: Date.now(),
      });
    } catch {
      reply(503, { error: "scanner_unavailable" });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  gateway().listen(
    Number(process.env.SCANNER_PORT || 8096),
    process.env.SCANNER_BIND || "127.0.0.1",
  );
