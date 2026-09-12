import { createBrowserClient } from "@supabase/ssr";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Cookies make the same session available to the browser and Next.js server.
export const supabase = url && key ? createBrowserClient(url, key) : null;
