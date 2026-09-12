import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.url().default("http://localhost:3000"),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});
export function readConfig() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report field names only; never print credentials or input values.
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  const config = parsed.data;
  if (new URL(config.FRONTEND_ORIGIN).origin !== config.FRONTEND_ORIGIN)
    throw new Error(
      "FRONTEND_ORIGIN must be an exact origin without a trailing slash or path.",
    );
  if (
    config.NODE_ENV === "production" &&
    (!config.FRONTEND_ORIGIN.startsWith("https://") ||
      !config.SUPABASE_URL.startsWith("https://"))
  )
    throw new Error("Production origins must use HTTPS.");
  return config;
}
