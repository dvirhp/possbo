import { describe, expect, it } from "vitest";
import { parseCsv, validateDraftCsv } from "../../src/utils/csv-import.js";

describe("CSV draft import", () => {
  it("parses quoted commas, escaped quotes and newlines", () => {
    expect(parseCsv('title,content\r\n"מבצע, קיץ","שורה 1\nשורה ""2"""')).toEqual([
      ["title", "content"],
      ["מבצע, קיץ", 'שורה 1\nשורה "2"'],
    ]);
  });

  it("normalizes valid draft rows", () => {
    const result = validateDraftCsv('\uFEFFtitle,content,platform,isAnonymous\nבדיקה,תוכן,instagram,כן');
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ title: "בדיקה", platform: "INSTAGRAM", isAnonymous: true, valid: true });
  });

  it("reports row-level validation errors", () => {
    const result = validateDraftCsv('content,platform,isAnonymous\n,linkedin,maybe');
    expect(result.rows[0].valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: "content" }),
      expect.objectContaining({ row: 2, field: "platform" }),
      expect.objectContaining({ row: 2, field: "isAnonymous" }),
    ]));
  });

  it("rejects unsupported and duplicate headers", () => {
    const result = validateDraftCsv('content,content,unknown\na,b,c');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 1, field: "content", message: "עמודה כפולה" }),
      expect.objectContaining({ row: 1, field: "unknown" }),
    ]));
  });
});
