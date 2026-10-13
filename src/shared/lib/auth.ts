/** @format */

import { getAccessToken } from "@shared/lib/openemr-auth.ts";

async function main() {
  const token = await getAccessToken(true);
  console.log("🚀 Connected! Production Access Token:", token);
}

main().catch((error: Error) => {
  console.error("❌ Authentication failed:", error.message);
  process.exit(1);
});
