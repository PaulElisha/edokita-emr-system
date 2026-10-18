/** @format */

import { Env } from "@/env.ts";
import logger from "@app/logger.ts";
import { errorHandler } from "@middleware/error-handler.ts";
import adminRouter from "@module/admin/admin.route.ts";
import appointmentRouter from "@module/appointment/appointment.route.ts";
import authRouter from "@module/auth/auth.route.ts";
import doctorRouter from "@module/doctor/doctor.route.ts";
import emrRouter from "@module/emr/emr.route.ts";
import labRouter from "@module/lab/lab.route.ts";
import messagingRouter from "@module/messaging/messaging.route.ts";
import notificationRouter from "@module/notification/notification.route.ts";
import openemrRouter from "@module/openemr/openemr.route.ts";
import patientRouter from "@module/patient/patient.route.ts";
import prescriptionRouter from "@module/prescription/prescription.route.ts";
import scheduleRouter from "@module/schedule/schedule.route.ts";
import systemRouter from "@module/system/system.route.ts";
import userRouter from "@module/user/user.route.ts";
import waitlistRouter from "@module/waitlist/waitlist.route.ts";
import spec, { options } from "@swagger/swagger.ts";
import cors from "@app/cors.ts";
import express, { type Express } from "express";
import helmet from "@app/helmet.ts";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";

class App {
 app: Express;

 constructor() {
  this.app = express();
  this.app.disable("x-powered-by");
  this.app.set("trust proxy", 1);
  this.initializeMiddlewares();
  this.initializeRoutes();
 }

 initializeMiddlewares() {
  this.app.use(cors);
  this.app.use(pinoHttp({ logger }));
  this.app.use(helmet);
  this.app.use(express.urlencoded({ limit: "10mb", extended: true }));
  this.app.use(express.json({ limit: "10mb" }));
 }

 initializeRoutes() {
  this.app.get("/", (_req, res) => {
   res.json({
    name: "E-Dokita EMR API",
    status: "ok",
    docs: "/api/docs",
   });
  });

  this.app.get("/health", (_req, res) => {
   res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
   });
  });

  this.app.use("/api/system", systemRouter);
  this.app.use("/api/auth", authRouter);
  this.app.use("/api/users", userRouter);
  this.app.use("/api/admin", adminRouter);
  this.app.use("/api/doctors", doctorRouter);
  this.app.use("/api/patients", patientRouter);
  this.app.use("/api/appointments", appointmentRouter);
  this.app.use("/api/emr", emrRouter);
  this.app.use("/api/lab", labRouter);
  this.app.use("/api/prescriptions", prescriptionRouter);
  this.app.use("/api/schedules", scheduleRouter);
  this.app.use("/api/waitlist", waitlistRouter);
  this.app.use("/api/conversations", messagingRouter);
  this.app.use("/api/notifications", notificationRouter);
  this.app.use("/api/openemr", openemrRouter);

  this.app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec, options));
  this.app.get("/api/docs.json", (_req, res) => {
   res.setHeader("Content-Type", "application/json");
   res.send(spec);
  });

  this.app.use(errorHandler);
 }

 start = () => {
  this.app.listen(Env.PORT, () => {
   logger.info(`E-Dokita EMR API listening on ${Env.LOCAL_URL}:${Env.PORT}`);
   logger.info(`Swagger docs at ${Env.LOCAL_URL}:${Env.PORT}/api/docs`);
  });
 };
}

const instance = new App();
export const app = instance.app;

if (process.env.NODE_ENV !== "test") {
 instance.start();
}

export default app;
