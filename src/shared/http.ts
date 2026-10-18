import type { JwtPayload } from "@auth/jwt.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import type { Request } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";

export type AuthRequest<
 P = ParamsDictionary,
 ResBody = unknown,
 ReqBody = unknown,
 ReqQuery = Query,
> = Request<P, ResBody, ReqBody, ReqQuery> & { user: JwtPayload };

export type OpenEMRRequest<
 P = ParamsDictionary,
 ResBody = unknown,
 ReqBody = unknown,
 ReqQuery = Query,
> = AuthRequest<P, ResBody, ReqBody, ReqQuery> & { openemr: OpenEMRClient };
