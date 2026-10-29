/** @format */

import type { AuthUser } from "@shared/http.ts";
import type OpenEMRClient from "./config/openemr-client/client.ts";

declare global {
 namespace Express {
  interface Request {
   user?: AuthUser;
   openemr?: OpenEMRClient;
  }
 }
}
