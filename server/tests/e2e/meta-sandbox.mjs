const required = ["META_GRAPH_API_VERSION", "META_USER_ACCESS_TOKEN", "META_PAGE_ID", "META_INSTAGRAM_BUSINESS_ACCOUNT_ID"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing Meta sandbox secrets: ${missing.join(", ")}`);

const base = `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION}`;
async function graph(path, fields) {
  const url = new URL(`${base}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", process.env.META_USER_ACCESS_TOKEN);
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(`Meta sandbox request failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

const page = await graph(process.env.META_PAGE_ID, "id,name,instagram_business_account");
if (String(page.id) !== String(process.env.META_PAGE_ID)) throw new Error("Meta sandbox returned an unexpected Page");
const instagram = await graph(process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID, "id,username,media_count");
if (String(instagram.id) !== String(process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID)) throw new Error("Meta sandbox returned an unexpected Instagram account");
console.log(`Meta sandbox passed: Page ${page.name}; Instagram @${instagram.username}`);
