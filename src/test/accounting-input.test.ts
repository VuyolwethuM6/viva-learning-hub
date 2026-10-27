import { describe, expect, it } from "vitest";
import {
  csvCell,
  parseStatementCSV,
  randToCents,
  validAccountingDate,
} from "@/lib/accounting-input";
describe("accounting money and statement inputs", () => {
  it("converts decimal rand to whole cents without rounding ambiguous input", () => {
    expect(randToCents("350.29")).toBe(35029);
    expect(randToCents("-15.01", true)).toBe(-1501);
    for (const amount of ["0.001", "1,000", "1e3", "NaN", "Infinity", "-1"])
      expect(() => randToCents(amount)).toThrow();
  });
  it("rejects impossible dates while accepting leap days", () => {
    expect(validAccountingDate("2028-02-29")).toBe(true);
    expect(validAccountingDate("2026-02-29")).toBe(false);
    expect(validAccountingDate("2026-13-01")).toBe(false);
  });
  it("parses quoted commas/newlines, escaped quotes and signed bank amounts", () => {
    expect(
      parseStatementCSV("transaction_id,date,description,amount\n"),
    ).toEqual([]);
    expect(
      parseStatementCSV(
        'transaction_id,date,description,amount\r\nTX-1,2026-10-27,"Tuition, Alex",800.00\r\nTX-2,2026-10-27,"Bank ""fee""",-15.50',
      ),
    ).toEqual([
      {
        externalId: "TX-1",
        postedOn: "2026-10-27",
        description: "Tuition, Alex",
        amountCents: 80000,
      },
      {
        externalId: "TX-2",
        postedOn: "2026-10-27",
        description: 'Bank "fee"',
        amountCents: -1550,
      },
    ]);
  });
  it("rejects duplicate IDs, broken quoting, zero amounts and unsupported headers", () => {
    for (const csv of [
      "transaction_id,date,description,amount\nA,2026-10-27,One,1\nA,2026-10-27,Two,2",
      'transaction_id,date,description,amount\nA,2026-10-27,"broken,1',
      "transaction_id,date,description,amount\nA,2026-10-27,Zero,0",
      "id,date,description,amount\nA,2026-10-27,One,1",
    ])
      expect(() => parseStatementCSV(csv)).toThrow();
  });
  it("protects exported text against spreadsheet formulas while preserving signed numeric values", () => {
    expect(csvCell('=HYPERLINK("x")')).toContain("'=HYPERLINK");
    expect(csvCell("-BANK-REF")).toBe('"\'-BANK-REF"');
    expect(csvCell(-15.5)).toBe('"-15.5"');
    expect(csvCell("2026-10-27")).toBe('"2026-10-27"');
  });
});
