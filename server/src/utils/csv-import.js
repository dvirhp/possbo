const REQUIRED_HEADERS = ["content"];
const SUPPORTED_HEADERS = new Set(["title", "content", "location", "isanonymous", "platform"]);
const VALID_PLATFORMS = new Set(["FACEBOOK", "INSTAGRAM", "WHATSAPP"]);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ""; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("UNCLOSED_QUOTE");
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(values => values.some(value => value.trim()));
}

function booleanValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (["true", "1", "yes", "כן"].includes(normalized)) return true;
  if (["false", "0", "no", "לא"].includes(normalized)) return false;
  return null;
}

export function validateDraftCsv(text, { maxRows = 500 } = {}) {
  const parsed = parseCsv(text);
  if (parsed.length < 2) return { headers: [], rows: [], errors: [{ row: 1, field: "file", message: "הקובץ חייב לכלול כותרות ולפחות שורת תוכן אחת" }] };
  const headers = parsed[0].map(header => header.trim().toLowerCase());
  const errors = [];
  for (const required of REQUIRED_HEADERS) if (!headers.includes(required)) errors.push({ row: 1, field: required, message: `עמודת ${required} היא חובה` });
  headers.forEach((header, index) => {
    if (!header) errors.push({ row: 1, field: `column_${index + 1}`, message: "שם עמודה חסר" });
    else if (!SUPPORTED_HEADERS.has(header)) errors.push({ row: 1, field: header, message: "עמודה אינה נתמכת" });
    else if (headers.indexOf(header) !== index) errors.push({ row: 1, field: header, message: "עמודה כפולה" });
  });
  if (parsed.length - 1 > maxRows) errors.push({ row: 1, field: "file", message: `ניתן לייבא עד ${maxRows} שורות בכל קובץ` });

  const rows = parsed.slice(1, maxRows + 1).map((values, offset) => {
    const source = Object.fromEntries(headers.map((header, index) => [header, String(values[index] || "").trim()]));
    const rowNumber = offset + 2;
    const rowErrors = [];
    if (!source.content) rowErrors.push({ row: rowNumber, field: "content", message: "תוכן הפוסט הוא חובה" });
    if (source.content?.length > 10000) rowErrors.push({ row: rowNumber, field: "content", message: "התוכן ארוך מ-10,000 תווים" });
    if (source.title?.length > 200) rowErrors.push({ row: rowNumber, field: "title", message: "הכותרת ארוכה מ-200 תווים" });
    const isAnonymous = booleanValue(source.isanonymous);
    if (isAnonymous === null) rowErrors.push({ row: rowNumber, field: "isAnonymous", message: "הערך חייב להיות true/false" });
    const platform = (source.platform || "FACEBOOK").toUpperCase();
    if (!VALID_PLATFORMS.has(platform)) rowErrors.push({ row: rowNumber, field: "platform", message: "הפלטפורמה חייבת להיות FACEBOOK, INSTAGRAM או WHATSAPP" });
    errors.push(...rowErrors);
    return { row: rowNumber, title: source.title || null, content: source.content, location: source.location || null, isAnonymous: isAnonymous ?? false, platform, valid: rowErrors.length === 0 };
  });
  return { headers, rows, errors };
}
