import "dotenv/config";
import jwt from "jsonwebtoken";

const token = jwt.sign(
  { userId: "151fa87c-455b-41fc-93b6-b00ad6313355", type: "access" },
  process.env.JWT_SECRET,
  { expiresIn: "1h" },
);

// Test campaigns list
const res = await fetch("http://localhost:5001/api/scheduler/campaigns", {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();

if (data.error) {
  console.log("Auth error:", data.error);
  process.exit(1);
}

const testCampaign = data.campaigns?.find(
  (c) => c.id === "7657ab26-16ff-4162-bcd2-61790737bf0d",
);

if (testCampaign) {
  console.log("LIST status:", testCampaign.status);
  console.log("publishedCount:", testCampaign.publishedCount);
} else {
  console.log(
    "Test campaign not found. Total campaigns:",
    data.campaigns?.length,
  );
}

// Test single campaign detail
const res2 = await fetch(
  "http://localhost:5001/api/scheduler/campaigns/7657ab26-16ff-4162-bcd2-61790737bf0d",
  { headers: { Authorization: `Bearer ${token}` } },
);
const data2 = await res2.json();
console.log("DETAIL status:", res2.status);
console.log(
  "Publication history count:",
  data2.campaign?.publicationHistory?.length ?? "N/A",
);
if (data2.error) console.log("Detail error:", data2.error);
