/** @format */
import { Env } from "../env.ts";
import logger from "./logger.ts";
import { errorHandler, notFound } from "./middleware/error-handler.ts";
import adminRouter from "./modules/admin/admin.route.ts";
import appointmentRouter from "./modules/appointment/appointment.route.ts";
import doctorRouter from "./modules/doctor/doctor.route.ts";
import emrRouter from "./modules/emr/emr.route.ts";
import patientRouter from "./modules/patient/patient.route.ts";
import systemRouter from "./modules/system/system.route.ts";
import spec from "./config/swagger.ts";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";

class App {
  app: Express;

  constructor() {
    this.app = express();
    this.app.disable("x-powered-by");
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeDocs();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares() {
    this.app.use(cors({ origin: Env.CORS_ORIGIN === "*" ? true : Env.CORS_ORIGIN }));
    this.app.use(pinoHttp({ logger }));
    this.app.use(helmet());
    this.app.use(express.json({ limit: "10mb" }));
  }

  private initializeRoutes() {
    this.app.get("/health", (_req, res) => {
      res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
    });

    this.app.use("/api/system", systemRouter);
    this.app.use("/api/admin", adminRouter);
    this.app.use("/api/doctors", doctorRouter);
    this.app.use("/api/patients", patientRouter);
    this.app.use("/api/appointments", appointmentRouter);
    this.app.use("/api/emr", emrRouter);
  }

  private initializeDocs() {
    this.app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
    this.app.get("/api/docs.json", (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.send(spec);
    });
  }

  private initializeErrorHandling() {
    this.app.use(notFound);
    this.app.use(errorHandler);
  }

  start = () => {
    this.app.listen(Env.PORT, () => {
      logger.info(`Hospital management API listening on http://localhost:${Env.PORT}`);
      logger.info(`Swagger docs at http://localhost:${Env.PORT}/api/docs`);
    });
  };
}

const instance = new App();
export const app = instance.app;

if (process.env.NODE_ENV !== "test") {
  instance.start();
}

export default app;