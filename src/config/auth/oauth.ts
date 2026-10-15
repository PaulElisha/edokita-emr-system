/** @format */
import { OpenEMR } from "@/env.ts";
import {
 allowInsecureRequests,
 ClientSecretPost,
 type AuthorizationServer,
 type Client,
} from "oauth4webapi";

/** OpenEMR is the OAuth2/OIDC authorization server our gateway talks to. */
export const authorizationServer: AuthorizationServer = {
 issuer: OpenEMR.issuer,
 token_endpoint: OpenEMR.oauthUrl,
};

/**
 * oauth4webapi refuses plain-HTTP endpoints unless explicitly allowed. Local
 * OpenEMR runs over HTTP, so permit it only when the configured URL is insecure.
 */
export const oauthOptions = {
 [allowInsecureRequests]: OpenEMR.url.startsWith("http:"),
};

export const oauthClient: Client = {
 client_id: OpenEMR.clientId,
 client_secret: OpenEMR.clientSecret,
};

let clientAuth: ReturnType<typeof ClientSecretPost> | null = null;

/**
 * Confidential client: authenticate at the token endpoint with
 * `client_secret_post`. Built lazily so a missing client secret surfaces as a
 * clear runtime error instead of crashing the process at import time.
 */
export function getClientAuth(): ReturnType<typeof ClientSecretPost> {
 if (!clientAuth) {
  if (!OpenEMR.clientSecret) {
   throw new Error(
    "OPENEMR_CLIENT_SECRET is not set; configure it to enable OpenEMR OAuth2",
   );
  }
  clientAuth = ClientSecretPost(OpenEMR.clientSecret);
 }
 return clientAuth;
}
