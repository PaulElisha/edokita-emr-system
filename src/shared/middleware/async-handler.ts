import type { NextFunction, Request, RequestHandler, Response } from "express";

export type AsyncHandler<R extends Request = Request> = (
 req: R,
 res: Response,
 next: NextFunction,
) => Promise<void>;

const asyncHandler =
 <R extends Request<any, any, any, any>>(
  controller: AsyncHandler<R>,
 ): RequestHandler =>
 (req, res, next) => {
  Promise.resolve(controller(req as R, res, next)).catch(next);
 };

export default asyncHandler;
