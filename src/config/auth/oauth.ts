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

/** Confidential client: authenticate at the token endpoint with `client_secret_post`. */
export const clientAuth = ClientSecretPost(OpenEMR.clientSecret);
