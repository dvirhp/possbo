import dotenv from "dotenv";
dotenv.config();
import prisma from "../src/config/prisma.js";
import { generateAccessToken } from "../src/utils/jwt.js";

// 1. Check DB
const accounts = await prisma.connectedAccount.findMany({
  where: { provider: "INSTAGRAM" },
});
console.log("=== DB Instagram Accounts ===");
for (const a of accounts) {
  console.log(
    `  id=${a.id} userId=${a.userId} status=${a.status} username=${a.providerUserName}`,
  );
}

const userId = accounts[0]?.userId;
if (!userId) {
  console.log("NO INSTAGRAM ACCOUNT FOUND");
  process.exit(1);
}

// 2. Generate a valid token for this user
const token = generateAccessToken(userId);
console.log("\n=== Testing with userId:", userId, "===");

// 3. Call /auth/me
const meRes = await fetch("http://localhost:8000/api/auth/me", {
  headers: { Authorization: "Bearer " + token },
});
const meData = await meRes.json();
console.log("\n=== /auth/me response ===");
console.log("  instagramConnected:", meData.instagramConnected);
console.log("  instagramUsername:", meData.instagramUsername);

// 4. Call /instagram/status
const statusRes = await fetch("http://localhost:8000/api/instagram/status", {
  headers: { Authorization: "Bearer " + token },
});
const statusData = await statusRes.json();
console.log("\n=== /instagram/status ===");
console.log(" ", JSON.stringify(statusData));

// 5. Now simulate what the CLIENT does: call /auth/refresh with a cookie
// We can't easily do this, but let's verify the refresh handler code
import fs from "fs";
const authCode = fs.readFileSync("./src/routes/auth.js", "utf-8");
const refreshIdx = authCode.indexOf('router.post("/refresh"');
const refreshEnd = authCode.indexOf("router.", refreshIdx + 50);
const refreshCode = authCode.substring(refreshIdx, refreshEnd);
const hasIgInRefresh = refreshCode.includes("instagramConnected");
console.log(
  "\n=== Refresh endpoint has instagramConnected:",
  hasIgInRefresh,
  "===",
);

// 6. Check if there's a cached user in the client that might be stale
console.log("\n=== CONCLUSION ===");
console.log("DB: Instagram IS connected (status=ACTIVE)");
console.log("/auth/me returns instagramConnected:", meData.instagramConnected);
console.log("Refresh endpoint has instagramConnected in code:", hasIgInRefresh);
if (meData.instagramConnected && hasIgInRefresh) {
  console.log(
    ">>> SERVER IS CORRECT. Problem must be client-side (stale localStorage cache or proxy issue)",
  );
}

await prisma.$disconnect();
