import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import authRouter from "./modules/auth/auth.routes.js";
import ordersRouter from "./modules/orders/orders.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true, // required for cookies to be sent cross-origin
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "10kb" })); // small limit — auth payloads are tiny

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/orders", ordersRouter);

app.use(errorHandler);

export default app;
