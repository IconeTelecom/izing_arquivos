import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";

import helmet from "helmet";

import { setQueues, BullAdapter, router as bullRoute } from "bull-board";

import "./database";
import uploadConfig from "./config/upload";
import AppError from "./errors/AppError";
import routes from "./routes";
import { logger } from "./utils/logger";
import Queue from "./libs/Queue";

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

app.use(helmet());

// Sets all of the defaults, but overrides script-src
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "block-all-mixed-content": [],
      "font-src": ["'self'", "https:", "data:"],
      "img-src": ["'self'", "data:"],
      "object-src": ["'none'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "https:", "'unsafe-inline'"],
      "upgrade-insecure-requests": [],
      // ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      scriptSrc: [
        "'self'",
        `*${process.env.FRONTEND_URL || "localhost: 3003"}`
        // "localhost"
      ],
      frameAncestors: [
        "'self'",
        `* ${process.env.FRONTEND_URL || "localhost: 3003"}`
      ]
    }
  })
);

Queue.process();
setQueues(Queue.queues.map((q: any) => new BullAdapter(q.bull)));

app.use("/admin/queues", bullRoute);

// em produção estou usando assim:
// if (process.env.NODE_ENV === "prod") {
//   app.use(
//     (req, res, next) => {
//       next();
//     },
//     cors({
//       credentials: true,
//       origin: process.env.FRONTEND_URL
//     })
//   );
// } else {
// app.use((req, res, next) => {
//   next();
// }, cors());
// }

// app.use(cors({ origin: "*" }));
app.use(
  cors({
    credentials: true,
    origin: process.env.FRONTEND_URL
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "20MB" }));
app.use(express.urlencoded({ extended: true, limit: "20MB" }));
app.use(Sentry.Handlers.requestHandler());
app.use("/public", express.static(uploadConfig.directory));
app.use(routes);

app.use(Sentry.Handlers.errorHandler());

app.use(async (err: Error, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    if (err.statusCode === 403) {
      logger.warn(err);
    } else {
      logger.error(err);
    }
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error(err);
  return res.status(500).json({ error: `Internal server error: ${err}` });
});

export default app;
