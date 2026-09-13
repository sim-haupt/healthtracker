import { eventTypeRouter } from "./event-types.js";
import { episodeRouter } from "./episodes.js";
import { providerRouter } from "./providers.js";
import { documentRouter } from "./documents.js";
import { z } from "zod";
import { attachmentRouter } from "./attachments.js";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { UserDataAccess } from "./data.js";
import { eventRouter, EventDataError, labelRouter } from "./events.js";
export type VerifiedUser = { id: string };
export type AppOptions = {
  frontendOrigin: string;
  dataForToken: (token: string) => UserDataAccess;
  trustProxyHops?: number;
  verifyToken: (token: string) => Promise<VerifiedUser | null>;
};
export function createApp(options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxyHops ?? 0);
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    cors({
      origin: options.frontendOrigin,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Please try again shortly." },
    }),
  );
  app.use("/api", async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.header("authorization") ?? "");
    if (!match) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const user = await options.verifyToken(match[1]);
      if (!user) {
        res.status(401).json({ error: "Invalid or expired session" });
        return;
      }
      const data = options.dataForToken(match[1]);
      if (!(await data.isApproved(user.id))) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.locals.user = user;
      res.locals.data = data;
      next();
    } catch {
      res
        .status(503)
        .json({ error: "Authentication is temporarily unavailable" });
    }
  });
  app.use("/api", express.json({ limit: "256kb" }));
  app.use("/api/v1/events/:eventId/attachments", attachmentRouter());
  app.use("/api/v1/documents", documentRouter());
  app.use("/api/v1/events", eventRouter());
  app.use("/api/v1/providers", providerRouter());
  app.use("/api/v1/event-types", eventTypeRouter());
  app.use("/api/v1/episodes", episodeRouter());
  app.use("/api/v1/tags", labelRouter("tags"));
  app.use("/api/v1/categories", labelRouter("categories"));
  app.get("/api/v1/me", (_req, res) => {
    res.json({ user: { id: (res.locals.user as VerifiedUser).id } });
  });
  app.put("/api/v1/profiles/:id", async (req, res) => {
    const id = String(req.params.id),
      owner = res.locals.user.id;
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(100),
        avatar: z.string().nullable(),
      })
      .strict()
      .safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new EventDataError(
        400,
        "Enter a profile name between 1 and 100 characters.",
      );
    if (
      parsed.data.avatar &&
      (!parsed.data.avatar.startsWith(`${owner}/${id}/`) ||
        !z.uuid().safeParse(parsed.data.avatar.split("/")[2]).success ||
        parsed.data.avatar.split("/").length !== 3)
    )
      throw new EventDataError(
        400,
        "Choose an image uploaded for this profile.",
      );
    const profile = await (res.locals.data as UserDataAccess).updateProfile(
      id,
      parsed.data,
    );
    if (!profile) throw new EventDataError(404, "Profile no longer available.");
    res.json({ profile });
  });
  app.get("/api/v1/profiles", async (_req, res) => {
    try {
      const profiles = await (res.locals.data as UserDataAccess).listProfiles();
      res.json({ profiles });
    } catch {
      res.status(503).json({ error: "Profiles are temporarily unavailable" });
    }
  });
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof EventDataError) {
      res
        .status(error.status)
        .json({ error: error.message, fields: error.fields });
      return;
    }
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "The request contains invalid JSON." });
      return;
    }
    if (error?.type === "entity.too.large") {
      res.status(413).json({
        error: "This event is too large. Shorten the details and try again.",
      });
      return;
    }
    res
      .status(500)
      .json({ error: "Unable to complete the request. Please try again." });
  };
  app.use(handleError);
  return app;
}
