import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type ValidationSource = "body" | "params" | "query" | "user";

const validate = <T extends ZodType>(
 schema: T,
 source: ValidationSource = "body",
) => {
 return (req: Request, _res: Response, next: NextFunction): void => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
   return next(result.error);
  }
  Object.defineProperty(req, source, {
   value: result.data,
   writable: true,
   configurable: true,
   enumerable: true,
  });
  next();
 };
};

export default validate;
