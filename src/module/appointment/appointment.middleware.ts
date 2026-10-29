import APIError from "@error/APIError.ts";
import type { NextFunction, Request, Response } from "express";
import { AppointmentBase } from "@module/appointment/appointment.base.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
import type { MappedAppointment } from "@shared/utils/fhir-mapper.ts";
import type {
 AppointmentStatus,
 UpdateAppointmentInput,
} from "@module/appointment/appointment.service.ts";

const STATUS_TRANSITIONS: Partial<
 Record<AppointmentStatus, readonly AppointmentStatus[]>
> = {
 proposed: ["awaiting-payment", "cancelled"],
 pending: ["awaiting-payment", "cancelled"],
 waitlist: ["awaiting-payment", "cancelled"],
 "awaiting-payment": ["booked", "cancelled"],
 booked: ["rescheduled", "fulfilled", "cancelled", "noshow"],
 rescheduled: ["rescheduled", "fulfilled", "cancelled", "noshow"],
 arrived: ["fulfilled", "cancelled", "noshow"],
 "checked-in": ["fulfilled", "cancelled", "noshow"],
};

const CANCELLABLE_STATUSES: ReadonlyArray<AppointmentStatus> = [
 "proposed",
 "pending",
 "waitlist",
 "awaiting-payment",
 "booked",
 "rescheduled",
 "arrived",
 "checked-in",
 "cancelled",
];

function canTransition(
 from: string | undefined,
 to: AppointmentStatus,
): boolean {
 if (!from) return false;
 return STATUS_TRANSITIONS[from as AppointmentStatus]?.includes(to) ?? false;
}

function hasStarted(appointment: MappedAppointment): boolean {
 if (!appointment.start) return true;
 return new Date(appointment.start).getTime() <= Date.now();
}

async function appointmentOf(req: Request): Promise<MappedAppointment> {
 if (!req.openemr) throw APIError.unauthorized();
 const { id } = idParamSchema.parse(req.params);
 const [appointment, err] = await AppointmentBase.loadAppointment(
   id,
  );
 if (err) throw err;
 if (!appointment) throw APIError.notFound("Appointment not found");
 return appointment;
}

interface AppointmentStatusGuard {
 from: ReadonlyArray<AppointmentStatus>;
 requireStarted?: boolean;
}

const requireAppointmentStatus =
 (guard: ReadonlyArray<AppointmentStatus> | AppointmentStatusGuard) =>
 async (req: Request, _res: Response, next: NextFunction) => {
  try {
   const appointment = await appointmentOf(req);
   const options: AppointmentStatusGuard = Array.isArray(guard)
    ? { from: guard as ReadonlyArray<AppointmentStatus> }
    : (guard as AppointmentStatusGuard);
   const current = appointment.status as AppointmentStatus | undefined;

   if (!current || !options.from.includes(current)) {
    return next(
     APIError.badRequest(
      `Appointment must be ${options.from.join(", ")} to perform this action`,
     ),
    );
   }
   if (options.requireStarted && !hasStarted(appointment)) {
    return next(
     APIError.badRequest(
      "Appointment can only be marked done after its scheduled start",
     ),
    );
   }
   next();
  } catch (e) {
   next(e);
  }
 };

export const acceptAppointment = requireAppointmentStatus([
 "pending",
 "proposed",
 "waitlist",
 "awaiting-payment",
]);

export const confirmAppointment = requireAppointmentStatus([
 "awaiting-payment",
 "booked",
]);

export const rescheduleAppointment = requireAppointmentStatus([
 "booked",
 "rescheduled",
]);

export const completeAppointment = requireAppointmentStatus({
 from: ["booked", "rescheduled", "arrived", "checked-in", "fulfilled"],
 requireStarted: true,
});

export const cancelAppointment = requireAppointmentStatus(
 CANCELLABLE_STATUSES,
);

export const guardAppointmentUpdate = async (
 req: Request,
 _res: Response,
 next: NextFunction,
) => {
 try {
  const appointment = await appointmentOf(req);
  const input = req.body as UpdateAppointmentInput;
  const current = appointment.status as AppointmentStatus | undefined;
  const user = req.user;
  if (!user) return next(APIError.unauthorized());
  const allAccess = user.role === "admin";

  if (input.status) {
   if (user.openemr.patientId && !allAccess) {
    return next(
     APIError.forbidden("Patients cannot change appointment status"),
    );
   }
   if (current !== input.status) {
    if (!allAccess && !canTransition(current, input.status)) {
     return next(
      APIError.badRequest(
       `Cannot change appointment status from ${current ?? "unknown"} to ${input.status}`,
      ),
     );
    }
   }
   if (input.status === "fulfilled" && !hasStarted(appointment)) {
    return next(
     APIError.badRequest(
      "Appointment can only be marked done after its scheduled start",
     ),
    );
   }
  }

  if (input.start && current !== "booked" && current !== "rescheduled") {
   return next(
    APIError.badRequest("Only booked appointments can be rescheduled"),
   );
  }

  next();
 } catch (e) {
  next(e);
 }
};
