import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTable, pick, toCsv } from "../src/lib/csv";
import {
  cleanText,
  monthKey,
  monthLabel,
  parseLooseDate,
  percentOf,
  positionToPage,
  slugify,
  toBool,
  toDateString,
  toInt,
  toNumber,
} from "../src/lib/utils";

/* These helpers sit between the spreadsheet and the database, so every import
   depends on them being right. Run with: npm test */

describe("parseLooseDate", () => {
  it("reads the sheet's Mmm-YY month labels", () => {
    assert.equal(monthKey(parseLooseDate("Jun-26")!), "2026-06-01");
    assert.equal(monthKey(parseLooseDate("Sep-24")!), "2024-09-01");
    // The analytics sheet used a comma instead of a hyphen.
    assert.equal(monthKey(parseLooseDate("Jan,26")!), "2026-01-01");
    assert.equal(monthKey(parseLooseDate("March 2025")!), "2025-03-01");
  });

  it("reads ISO dates", () => {
    assert.equal(toDateString(parseLooseDate("2026-06-26")), "2026-06-26");
    assert.equal(toDateString(parseLooseDate("2026/06/26")), "2026-06-26");
    assert.equal(toDateString(parseLooseDate("2026-06")), "2026-06-01");
  });

  it("treats an unambiguous day-first date as DD/MM/YYYY", () => {
    assert.equal(toDateString(parseLooseDate("26/06/2026")), "2026-06-26");
  });

  it("swaps the parts when the first number cannot be a day", () => {
    // 13 cannot be a month, so this must be MM/DD.
    assert.equal(toDateString(parseLooseDate("06/13/2026")), "2026-06-13");
  });

  it("converts Excel serial numbers", () => {
    // 45000 → 2023-03-15 in Excel's 1900 date system.
    assert.equal(toDateString(parseLooseDate(45000)), "2023-03-15");
  });

  it("returns null for junk instead of an Invalid Date", () => {
    assert.equal(parseLooseDate(""), null);
    assert.equal(parseLooseDate(null), null);
    assert.equal(parseLooseDate("not a date"), null);
    assert.equal(parseLooseDate(42), null);
  });

  it("passes Date objects straight through", () => {
    const d = new Date(Date.UTC(2025, 10, 26));
    assert.equal(toDateString(parseLooseDate(d)), "2025-11-26");
  });
});

describe("monthLabel", () => {
  it("round-trips to the sheet's label format", () => {
    assert.equal(monthLabel("2026-06-01"), "Jun-26");
    assert.equal(monthLabel("2024-09-01"), "Sep-24");
  });

  it("does not shift across a month boundary in negative timezones", () => {
    // A UTC-anchored key must not become May-26 west of Greenwich.
    assert.equal(monthLabel(monthKey("2026-06-01")), "Jun-26");
  });
});

describe("toBool", () => {
  it("accepts every truthy spelling the sheet used", () => {
    for (const value of [true, 1, "Y", "y", "Yes", "TRUE", "true", "1", "Published"]) {
      assert.equal(toBool(value), true, `expected ${String(value)} to be true`);
    }
  });

  it("treats blanks, N and FALSE as false", () => {
    for (const value of [false, 0, "", null, undefined, "N", "No", "FALSE", "-"]) {
      assert.equal(toBool(value), false, `expected ${String(value)} to be false`);
    }
  });
});

describe("toNumber / toInt", () => {
  it("strips currency, percent and thousands separators", () => {
    assert.equal(toNumber("$4.53"), 4.53);
    assert.equal(toNumber("1,405"), 1405);
    assert.equal(toNumber("23%"), 23);
    assert.equal(toInt("1000+"), 1000);
  });

  it("returns null rather than NaN for blanks", () => {
    assert.equal(toNumber(""), null);
    assert.equal(toNumber(null), null);
    assert.equal(toNumber("n/a"), null);
    assert.equal(toInt(undefined), null);
  });
});

describe("cleanText", () => {
  it("removes the zero-width characters the sheet was full of", () => {
    assert.equal(cleanText("email marketing services​"), "email marketing services");
    assert.equal(cleanText("﻿SEO Services"), "SEO Services");
    assert.equal(cleanText("a b"), "a b");
  });

  it("collapses whitespace and returns null for empties", () => {
    assert.equal(cleanText("  On Page \n Status  "), "On Page Status");
    assert.equal(cleanText("   "), null);
    assert.equal(cleanText(null), null);
  });
});

describe("positionToPage", () => {
  it("maps positions to SERP pages of ten", () => {
    assert.equal(positionToPage(1), 1);
    assert.equal(positionToPage(10), 1);
    assert.equal(positionToPage(11), 2);
    assert.equal(positionToPage(20), 2);
    assert.equal(positionToPage(92), 10);
  });

  it("handles the decimals the sheet stored for averaged positions", () => {
    assert.equal(positionToPage(26.6), 3);
    assert.equal(positionToPage(44.8), 5);
  });

  it("returns null for missing or nonsensical positions", () => {
    assert.equal(positionToPage(null), null);
    assert.equal(positionToPage(0), null);
    assert.equal(positionToPage(-5), null);
  });
});

describe("percentOf", () => {
  it("never divides by zero", () => {
    assert.equal(percentOf(5, 0), 0);
    assert.equal(percentOf(0, 0), 0);
  });

  it("computes the sheet's CTR the same way", () => {
    // Jun-26 in the workbook: 9 clicks / 118003 impressions.
    assert.equal(percentOf(9, 118003).toFixed(6), "0.007627");
  });
});

describe("slugify", () => {
  it("produces url-safe project slugs", () => {
    assert.equal(slugify("Mindcob"), "mindcob");
    assert.equal(slugify("Acme Co. — Canada"), "acme-co-canada");
    assert.equal(slugify("Café Déjà"), "cafe-deja");
  });
});

describe("parseTable", () => {
  it("detects tab-separated pastes from a spreadsheet", () => {
    const text = "Keywords\tIntent\tTraffic\nseo audit\tTransactional\t170";
    const table = parseTable(text);
    assert.equal(table.delimiter, "\t");
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0].keywords, "seo audit");
    assert.equal(table.rows[0].traffic, "170");
  });

  it("handles quoted CSV fields containing commas and newlines", () => {
    const text = 'Page Title,Notes\n"SEO, full service","line one\nline two"';
    const table = parseTable(text);
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0].pagetitle, "SEO, full service");
    assert.equal(table.rows[0].notes, "line one\nline two");
  });

  it("unescapes doubled quotes", () => {
    const table = parseTable('A\n"say ""hi"""');
    assert.equal(table.rows[0].a, 'say "hi"');
  });

  it("normalises headers so sheet names with newlines still match", () => {
    // The workbook's headers really do contain newlines ("On Page \nStatus").
    // A spreadsheet quotes such cells on copy, which is what we get here.
    const table = parseTable('"On Page \nStatus","SEO \nScore"\nTRUE,80+');
    assert.equal(table.rows[0].onpagestatus, "TRUE");
    assert.equal(table.rows[0].seoscore, "80+");
  });

  it("treats an unquoted newline as a row break, per RFC 4180", () => {
    const table = parseTable("A,B\n1,2");
    assert.deepEqual(table.headers, ["A", "B"]);
    assert.equal(table.rows.length, 1);
  });

  it("skips fully blank rows", () => {
    const table = parseTable("A,B\n1,2\n,\n3,4");
    assert.equal(table.rows.length, 2);
  });

  it("strips a leading byte-order mark", () => {
    const table = parseTable("﻿Keywords\nseo");
    assert.equal(table.rows[0].keywords, "seo");
  });
});

describe("pick", () => {
  const row = { keywords: "seo audit", noofclicks: "29", indexyn: "Y" };

  it("finds a column by any of its aliases", () => {
    assert.equal(pick(row, "Keywords"), "seo audit");
    assert.equal(pick(row, "keyword", "Keywords"), "seo audit");
    assert.equal(pick(row, "No of Clicks"), "29");
    assert.equal(pick(row, "Index (Y/N)"), "Y");
  });

  it("returns undefined when nothing matches", () => {
    assert.equal(pick(row, "Impressions"), undefined);
  });
});

describe("toCsv", () => {
  it("quotes fields that need it and prefixes a BOM for Excel", () => {
    const csv = toCsv([{ url: "https://a.test", note: 'has, comma and "quote"' }], [
      { key: "url", header: "URL" },
      { key: "note", header: "Note" },
    ]);
    assert.ok(csv.startsWith("﻿"), "should start with a BOM");
    assert.ok(csv.includes('"has, comma and ""quote"""'));
  });

  it("round-trips through parseTable", () => {
    const rows = [{ keyword: "seo, audit", volume: 170 }];
    const csv = toCsv(rows, [
      { key: "keyword", header: "Keywords" },
      { key: "volume", header: "Traffic" },
    ]);
    const back = parseTable(csv);
    assert.equal(back.rows[0].keywords, "seo, audit");
    assert.equal(back.rows[0].traffic, "170");
  });
});
