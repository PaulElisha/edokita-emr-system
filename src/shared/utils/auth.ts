import { getAccessToken } from "@shared/utils/openemr-auth.ts";

async function main() {
 const token = await getAccessToken(true);
 console.log("🚀 Connected! Production Access Token:", token);
}

main().catch((error: Error) => {
 console.error("❌ Authentication failed:", error.message);
 process.exit(1);
});
