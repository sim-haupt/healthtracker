import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app.js";
import { createUserDataAccess } from "./data.js";
import { readConfig } from "./config.js";
const config = readConfig();
const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
const app = createApp({
  frontendOrigin: config.FRONTEND_ORIGIN,
  dataForToken: (token) =>
    createUserDataAccess(
      config.SUPABASE_URL,
      config.SUPABASE_PUBLISHABLE_KEY,
      token,
    ),
  trustProxyHops: config.TRUST_PROXY_HOPS,
  async verifyToken(token) {
    const { data, error } = await supabase.auth.getClaims(token);
    const id = data?.claims?.sub;
    if (error || typeof id !== "string") return null;
    return { id };
  },
});
const server = app.listen(config.PORT, "0.0.0.0", () => {
  console.info(`Healthtracker API listening on port ${config.PORT}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
