import { OpenEMR } from "@/env.ts";
import {
 allowInsecureRequests,
 ClientSecretPost,
 type AuthorizationServer,
 type Client,
} from "oauth4webapi";

export const authorizationServer: AuthorizationServer = {
 issuer: OpenEMR.issuer,
 token_endpoint: OpenEMR.oauthUrl,
};

export const oauthOptions = {
 [allowInsecureRequests]: OpenEMR.url.startsWith("http:"),
};

export const oauthClient: Client = {
 client_id: OpenEMR.clientId,
 client_secret: OpenEMR.clientSecret,
};

let clientAuth: ReturnType<typeof ClientSecretPost> | null = null;

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
