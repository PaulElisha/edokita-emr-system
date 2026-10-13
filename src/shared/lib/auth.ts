/** @format */

import fs from "fs";
import { randomUUID } from "crypto";
import { SignJWT, importPKCS8 } from "jose";
import { Env } from "@/env.ts";

const OPENEMR_URL = Env.LOCAL_OPENEMR_URL;
const CLIENT_ID = Env.LOCAL_OPENEMR_CLIENT_ID;
const AUD_URI = Env.LOCAL_OPENEMR_AUD_URI;

// Read your local OpenSSL private key file
const privateKeyPem = fs.readFileSync("./private-key.pem", "utf8");

async function getLiveAccessToken() {
 try {
  if (!CLIENT_ID || !AUD_URI) {
   throw new Error("Missing CLIENT_ID or AUD_URI in environment variables.");
  }

  // 1. Import the PEM private key into a Web Crypto KeyObject format
  const privateKey = await importPKCS8(privateKeyPem, "RS256");

  // 2. Build and sign the JWT Assertion using the jose SignJWT class
  const assertionJWT = await new SignJWT({})
   .setProtectedHeader({ alg: "RS256", kid: "edokita-api-key-1" })
   .setIssuer(CLIENT_ID)
   .setSubject(CLIENT_ID)
   .setAudience(AUD_URI)
   .setExpirationTime("5m") // Valid for 5 minutes
   .setJti(randomUUID()) // Unique request token tracker
   .sign(privateKey);

  // 3. Post the assertion payload straight to OpenEMR's token handler
  // Update step 3 inside your auth.ts file for production:
  const response = await fetch(`${OPENEMR_URL}/oauth2/default/token`, {
   method: "POST",
   headers: { "Content-Type": "application/x-www-form-urlencoded" },
   body: new URLSearchParams({
    grant_type: "client_credentials", // 🚀 Switches from password to secure system keys
    client_assertion_type:
     "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertionJWT, // Signed by your private-key.pem file
    scope: "system/Patient.read system/Patient.rs", // Uses global system administrative scopes
   }),
  });

  const data = await response.json();
  if (data.error) {
   throw new Error(data.error_description || data.error);
  }

  console.log("🚀 Connected! Production Access Token:", data.access_token);
  return data.access_token;
 } catch (error: any) {
  console.error("❌ Authentication failed:", error.message);
 }
}

// Execute the test script runner
getLiveAccessToken();
