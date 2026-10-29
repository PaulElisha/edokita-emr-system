/** @format */

import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncController<R extends Request = Request> = (
 req: R,
 res: Response,
 next: NextFunction,
) => Promise<void>;

const AsyncHandler =
 <R extends Request<any, any, any, any>>(
  controller: AsyncController<R>,
 ): RequestHandler =>
 (req, res, next) => {
  Promise.resolve(controller(req as R, res, next)).catch(next);
 };

export default AsyncHandler;
