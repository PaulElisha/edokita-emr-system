/** @format */

import type { AuthUser } from "@module/user/helper.ts";
import type OpenEMRClient from "../config/openemr-client/client.ts";
import type { Request } from "express";

export type { AuthUser };

export type AuthRequest<
 P = Request["params"],
 ResBody = unknown,
 ReqBody = unknown,
 ReqQuery = Request["query"],
> = Request<P, ResBody, ReqBody, ReqQuery> & { user: AuthUser };

export type OpenEMRRequest<
 P = Request["params"],
 ResBody = unknown,
 ReqBody = unknown,
 ReqQuery = Request["query"],
> = AuthRequest<P, ResBody, ReqBody, ReqQuery> & { openemr: OpenEMRClient };
