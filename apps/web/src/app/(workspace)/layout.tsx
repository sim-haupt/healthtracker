import { redirect } from "next/navigation";
import { AppShell, type HealthProfile } from "@/components/app-shell";
import { serverSupabase } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await serverSupabase();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") redirect("/login");
  // RLS is authoritative even if someone bypasses the browser/API.
  const [membershipResult, profilesResult] = await Promise.all([
    supabase
      .from("app_users")
      .select("user_id")
      .eq("user_id", userId)
      .eq("enabled", true)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id,name,avatar,created_at")
      .order("created_at")
      .order("name")
      .order("id"),
  ]);
  if (membershipResult.error || !membershipResult.data)
    redirect("/login?access=unavailable");
  if (profilesResult.error) redirect("/login?access=unavailable");
  return (
    <AppShell
      userId={userId}
      initialProfiles={profilesResult.data as HealthProfile[]}
    >
      {children}
    </AppShell>
  );
}
