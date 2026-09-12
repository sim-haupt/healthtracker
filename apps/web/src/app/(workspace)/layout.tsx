import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { serverSupabase } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await serverSupabase();
  if (!supabase) redirect("/login");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  // RLS is authoritative even if someone bypasses the browser/API.
  const { data: membership, error: membershipError } = await supabase
    .from("app_users")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .maybeSingle();
  if (membershipError || !membership) redirect("/login?access=unavailable");
  return <AppShell userId={user.id}>{children}</AppShell>;
}
