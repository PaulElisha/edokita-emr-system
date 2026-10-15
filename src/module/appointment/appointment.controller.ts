/** @format */
import type { JwtPayload } from "@auth/jwt.ts";
import APIError from "@error/APIError.ts";
import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { Request, Response } from "express";
import AppointmentService, {
 type AppointmentListQuery,
 type CreateAppointmentInput,
 type SlotsQuery,
} from "@module/appointment/appointment.service.ts";
import type { BookingActor } from "@module/appointment/helper.ts";

function actor(req: { user?: JwtPayload }): BookingActor {
 if (!req.user) throw APIError.unauthorized();
 return { userId: req.user.userId, role: req.user.role };
}

class AppointmentController {
 getAppointments = asyncHandler(
  async (
   req: Request<unknown, unknown, unknown, AppointmentListQuery>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.getAppointments(
    req.openemr!,
    req.query,
    actor(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 categories = asyncHandler(async (req: Request, res: Response) => {
  const [data, err] = await AppointmentService.categories();
  if (err) throw err;
  res.json({ success: true, data });
 });

 slots = asyncHandler(async (req: Request, res: Response) => {
  // `validate(slotsQuerySchema, "query")` guarantees this shape at runtime;
  // Express types required query params as ParsedQs, hence the local cast.
  const query = req.query as unknown as SlotsQuery;
  const [data, err] = await AppointmentService.slots(req.openemr!, query);
  if (err) throw err;
  res.json({ success: true, data });
 });

 getAppointment = asyncHandler(async (req: Request<IdParam>, res: Response) => {
  const [data, err] = await AppointmentService.getAppointment(
   req.openemr!,
   req.params.id,
   actor(req),
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 create = asyncHandler(
  async (
   req: Request<unknown, unknown, CreateAppointmentInput>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.create(
    req.openemr!,
    req.body,
    actor(req),
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );
}

export default new AppointmentController();
