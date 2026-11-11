// Offline operator utility. Never connects to a database or transmits applicant data.
// `sign export.json signed.json` after protected recruitment_erasure_export.
// `restore-sql signed.json restore.sql` verifies integrity and produces reviewable SQL.
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
const [mode, input, output] = process.argv.slice(2),
  key = process.env.RECRUITMENT_ERASURE_MANIFEST_KEY || "";
if (
  !["sign", "restore-sql"].includes(mode) ||
  !input ||
  !output ||
  key.length < 32
)
  throw Error(
    "Usage: sign|restore-sql input output; separate authorized manifest key required",
  );
const mac = (data) => createHmac("sha256", key).update(data).digest("hex");
if (mode === "sign") {
  const records = JSON.parse(readFileSync(input, "utf8"));
  if (!Array.isArray(records) || records.length > 10000)
    throw Error("Invalid export");
  const payload = JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    records,
  });
  writeFileSync(output, JSON.stringify({ payload, signature: mac(payload) }), {
    mode: 0o600,
    flag: "wx",
  });
} else {
  const packet = JSON.parse(readFileSync(input, "utf8")),
    expected = mac(packet.payload),
    got = packet.signature || "";
  if (
    !/^[0-9a-f]{64}$/.test(got) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(got))
  )
    throw Error("Manifest signature invalid");
  const data = JSON.parse(packet.payload);
  if (
    data.version !== 1 ||
    !Array.isArray(data.records) ||
    data.records.some((r) => Date.parse(r.expires_at) <= Date.now())
  )
    throw Error("Manifest expired or unsupported");
  const operator = process.env.RECRUITMENT_OPERATOR_REFERENCE || "",
    approval = process.env.RECRUITMENT_APPROVAL_REFERENCE || "";
  if (
    !/^[A-Za-z0-9._/-]{3,160}$/.test(operator) ||
    !/^[A-Za-z0-9._/-]{3,160}$/.test(approval)
  )
    throw Error("Operator authorization references required");
  const json = JSON.stringify(data.records).replaceAll("'", "''");
  writeFileSync(
    output,
    `-- OFFLINE REVIEW REQUIRED. No flags are enabled.\nbegin;\nselect public.recruitment_erasure_restore('${json}'::jsonb,'${operator}','${approval}');\ncommit;\n`,
    { mode: 0o600, flag: "wx" },
  );
}
console.log("Protected artifact written. No database action executed.");
