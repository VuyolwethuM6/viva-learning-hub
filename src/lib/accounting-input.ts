export function randToCents(value: string, signed = false): number {
  const text = value.trim();
  if (!(signed ? /^[+-]?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(text))
    throw new Error(
      "Use a decimal rand amount with at most two decimal places, for example 350.00.",
    );
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^[+-]/, "").split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2000000000)
    throw new Error(
      "The amount exceeds the supported transaction limit of R20,000,000.",
    );
  return negative ? -amount : amount;
}
export function validAccountingDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(new Date(`${value}T12:00:00Z`).getTime()) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export type BankImportRow = {
  externalId: string;
  postedOn: string;
  description: string;
  amountCents: number;
};
export function parseStatementCSV(source: string): BankImportRow[] {
  if (source.length > 1000000)
    throw new Error("Use a statement CSV under 1 MB.");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const content = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (quoted) {
      if (c === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === "," || c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && content[i + 1] === "\n") i++;
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
      }
    } else {
      if (closed && c.trim())
        throw new Error("The CSV contains text after a closing quote.");
      field += c;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 1 || rows.length > 501)
    throw new Error("Import a header and up to 500 transactions.");
  const header = rows.shift()!.map((v) => v.trim().toLowerCase());
  const required = ["transaction_id", "date", "description", "amount"];
  if (header.length !== 4 || required.some((key) => !header.includes(key)))
    throw new Error(
      "CSV headers must be transaction_id,date,description,amount. Amounts are signed rand values with decimal points.",
    );
  const seen = new Set<string>();
  return rows.map((fields, i) => {
    if (fields.length !== 4)
      throw new Error(`CSV row ${i + 2} must contain four fields.`);
    const get = (key: string) => fields[header.indexOf(key)].trim();
    const id = get("transaction_id"),
      date = get("date"),
      description = get("description");
    if (!id || id.length > 150 || seen.has(id))
      throw new Error(
        `CSV row ${i + 2} needs a unique bank transaction ID of at most 150 characters.`,
      );
    if (!validAccountingDate(date))
      throw new Error(`CSV row ${i + 2} needs an ISO date such as 2026-11-01.`);
    if (!description || description.length > 500)
      throw new Error(
        `CSV row ${i + 2} needs a description of up to 500 characters.`,
      );
    const amount = randToCents(get("amount"), true);
    if (!amount)
      throw new Error(`CSV row ${i + 2} has a zero transaction amount.`);
    seen.add(id);
    return { externalId: id, postedOn: date, description, amountCents: amount };
  });
}
export function csvCell(value: string | number | null | undefined): string {
  let text = String(value ?? "");
  if (typeof value === "string" && /^\s*[=+\-@\t\r]/.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export const statementTemplate =
  "transaction_id,date,description,amount\nBANK-001,2026-11-01,Tuition EFT,800.00\nBANK-002,2026-11-02,Bank charge,-15.00\n";
