/** @format */

import { JwtPayload } from "@auth/jwt.ts";
import type OpenEMRClient from "@module/openemr/client.ts";

declare global {
 namespace Express {
  interface Request {
   user?: JwtPayload;
   openemr?: OpenEMRClient;
  }
 }
}
