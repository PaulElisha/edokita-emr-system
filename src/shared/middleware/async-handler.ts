/** @format */

import type { NextFunction, Request, Response } from "express";

export type AsyncHandler<
 P = any,
 ResBody = any,
 ReqBody = any,
 ReqQuery = any,
> = (
 req: Request<P, ResBody, ReqBody, ReqQuery>,
 res: Response,
 next: NextFunction,
) => Promise<void>;

const asyncHandler =
 <P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
  controller: AsyncHandler<P, ResBody, ReqBody, ReqQuery>,
 ) =>
 (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response,
  next: NextFunction,
 ) => {
  Promise.resolve(controller(req, res, next)).catch(next);
 };

export default asyncHandler;
