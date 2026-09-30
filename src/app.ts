import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";

const app = express();

// Behind Render/Railway's proxy and the Next.js /api rewrite: needed for correct client IPs in rate limiting.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use(routes);

app.use(notFound);
app.use(errorHandler);

export default app;
