#!/usr/bin/env node

import { bootstrapFacebookSession } from "../src/utils/facebook-automation.js";

async function main() {
  try {
    console.log("🌐 Opening Facebook login browser...");
    console.log("📌 Login in the browser window that appears.");
    console.log("⏳ This will wait up to 3 minutes for you to log in...");
    console.log("");

    await bootstrapFacebookSession();

    console.log("");
    console.log("✅ Success! Your Facebook session has been saved.");
    console.log(
      "📱 You can now use the app to search and capture screenshots.",
    );
    process.exit(0);
  } catch (error) {
    if (error.message === "FACEBOOK_SESSION_NOT_COMPLETED") {
      console.error("❌ Facebook login was not completed. Please try again.");
    } else {
      console.error("❌ Error:", error.message);
    }
    process.exit(1);
  }
}

main();
