/** @format */
import type { JwtPayload } from "@auth/jwt.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import type { Request } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";

/**
 * A request that has passed `authenticate`, so `user` is always present.
 */
export type AuthRequest<
 P = ParamsDictionary,
 ResBody = unknown,
 ReqBody = unknown,
 ReqQuery = Query,
> = Request<P, ResBody, ReqBody, ReqQuery> & { user: JwtPayload };

/**
 * A request that has passed `authenticate` and `withOpenEMR`, so both `user`
 * and `openemr` are always present.
 */
export type OpenEMRRequest<
 P = ParamsDictionary,
 ResBody = unknown,
 ReqBody = unknown,
 ReqQuery = Query,
> = AuthRequest<P, ResBody, ReqBody, ReqQuery> & { openemr: OpenEMRClient };
