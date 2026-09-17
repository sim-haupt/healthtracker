"use client";
import { EventTypesProvider } from "./event-types";
import { ProvidersProvider } from "./providers-context";
import { ToastProvider } from "./ui/feedback";
import {
  ProfileAvatar,
  ProfileAvatarGroup,
  ProfileIdentity,
} from "./ui/profile-avatar";
import { CustomSelect } from "./ui/pickers";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  Activity,
  LayoutDashboard,
  CalendarDays,
  History,
  Files,
  Layers,
  Stethoscope,
  Syringe,
  Settings2,
  LogOut,
  Menu,
  X,
  Bell,
} from "lucide-react";
import { TrackerProvider } from "./tracker/context";
import { supabase } from "@/lib/supabase";
export type HealthProfile = {
  id: string;
  name: string;
  avatar: string | null;
  created_at: string;
};
const ProfileContext = createContext<{
  activeProfile: HealthProfile | null;
  profiles: HealthProfile[];
  setActiveProfile: (id: string) => void;
  updateProfile: (profile: HealthProfile) => void;
}>({
  activeProfile: null,
  profiles: [],
  setActiveProfile: () => {},
  updateProfile: () => {},
});
export const useProfiles = () => useContext(ProfileContext);
export const useProfile = () =>
  useContext(ProfileContext).activeProfile?.name ?? "";
export const useProfileCount = () => useContext(ProfileContext).profiles.length;
const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/timeline", label: "Timeline", icon: History },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/episodes", label: "Health episodes", icon: Layers },
  { href: "/documents", label: "Documents", icon: Files },
  { href: "/vaccinations", label: "Vaccinations", icon: Syringe },
  { href: "/providers", label: "Medical Providers", icon: Stethoscope },
  { href: "/reminders", label: "Reminders", icon: Bell },
];
const pageLabels = [...navigation, { href: "/settings", label: "Settings" }];
function RouteDataProviders({
  pathname,
  children,
}: {
  pathname: string;
  children: React.ReactNode;
}) {
  const matches = (routes: string[]) =>
    routes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
  let content = children;
  if (
    matches([
      "/dashboard",
      "/timeline",
      "/calendar",
      "/events",
      "/episodes",
      "/documents",
      "/providers",
      "/settings",
    ])
  )
    content = <EventTypesProvider>{content}</EventTypesProvider>;
  if (
    matches([
      "/timeline",
      "/calendar",
      "/events",
      "/episodes",
      "/documents",
      "/vaccinations",
      "/providers",
      "/settings",
    ])
  )
    content = <TrackerProvider>{content}</TrackerProvider>;
  if (matches(["/timeline", "/calendar", "/events", "/providers"]))
    content = <ProvidersProvider>{content}</ProvidersProvider>;
  return content;
}
export function AppShell({
  children,
  userId,
  initialProfiles,
}: {
  children: React.ReactNode;
  userId: string;
  initialProfiles: HealthProfile[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(initialProfiles.length > 0);
  const [error, setError] = useState(
    initialProfiles.length
      ? ""
      : "No health profiles are available. Contact the workspace owner.",
  );
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] =
    useState<HealthProfile[]>(initialProfiles);
  const [profileId, setProfileId] = useState("");
  const activeProfile = profiles.find((item) => item.id === profileId) ?? null;
  useEffect(() => {
    if (!supabase) {
      router.replace("/login");
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user.id !== userId) {
        setReady(false);
        setProfiles([]);
        window.location.replace("/dashboard");
        return;
      }
      if (event === "SIGNED_OUT") {
        setReady(false);
        setProfiles([]);
        window.location.replace("/login");
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [router, userId]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const elements = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled)",
        ) ?? [],
      ).filter((el) => el.getClientRects().length);
    elements()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key === "Tab") {
        const nodes = elements(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
  async function signOut() {
    const result = await supabase?.auth.signOut({ scope: "local" });
    if (result?.error) {
      setError("Could not sign out. Please try again.");
      return;
    }
    setReady(false);
    setProfiles([]);
    window.location.replace("/login");
  }
  if (!ready)
    return (
      <main className="auth-state">
        <Activity size={30} />
        <h1>
          {error ? "Unable to open your workspace" : "Opening your workspace…"}
        </h1>
        {error && (
          <>
            <p role="alert">{error}</p>
            <Link className="button" href="/login">
              Return to sign in
            </Link>
          </>
        )}
      </main>
    );
  return (
    <ProfileContext.Provider
      value={{
        activeProfile,
        profiles,
        setActiveProfile: setProfileId,
        updateProfile: (profile) =>
          setProfiles((items) =>
            items.map((item) => (item.id === profile.id ? profile : item)),
          ),
      }}
    >
      <ToastProvider>
        <RouteDataProviders pathname={pathname}>
          <div className="app-shell">
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            {open && (
              <button
                className="nav-backdrop"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
              />
            )}
            <aside
              className={`sidebar ${open ? "is-open" : ""}`}
              aria-label="Main navigation"
            >
              <Link
                className="brand"
                href="/dashboard"
                onClick={() => setOpen(false)}
              >
                <span className="brand-mark">
                  <Activity size={24} />
                </span>
                Health tracker
              </Link>
              <button
                className="mobile-close icon-button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X />
              </button>

              <nav>
                {navigation.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`nav-item ${pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""}`}
                    aria-current={
                      pathname === href || pathname.startsWith(`${href}/`)
                        ? "page"
                        : undefined
                    }
                  >
                    <Icon size={20} />
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <button className="nav-item sign-out" onClick={signOut}>
                  <LogOut size={19} />
                  Sign out
                </button>
              </div>
            </aside>
            <div className="workspace">
              <header className="header">
                <div className="header-context">
                  <button
                    className="icon-button mobile-menu"
                    aria-label="Open navigation"
                    aria-expanded={open}
                    onClick={() => setOpen(true)}
                  >
                    <Menu />
                  </button>

                  <strong>
                    {
                      pageLabels.find(
                        (n) =>
                          pathname === n.href ||
                          pathname.startsWith(`${n.href}/`),
                      )?.label
                    }
                  </strong>
                </div>
                <div className="profile-control">
                  {activeProfile ? (
                    <ProfileAvatar
                      name={activeProfile.name}
                      avatar={activeProfile.avatar}
                    />
                  ) : (
                    <ProfileAvatarGroup profiles={profiles} />
                  )}
                  <label className="sr-only" htmlFor="profile">
                    Active health profile
                  </label>
                  <CustomSelect
                    id="profile"
                    value={profileId}
                    ariaLabel="Active health profile"
                    onChange={setProfileId}
                    options={[
                      { value: "", label: "Both profiles" },
                      ...profiles.map((profile) => ({
                        value: profile.id,
                        label: profile.name,
                        content: (
                          <ProfileIdentity
                            name={profile.name}
                            avatar={profile.avatar}
                          />
                        ),
                      })),
                    ]}
                  />
                  <Link
                    href="/settings"
                    className={`icon-button header-settings ${pathname === "/settings" || pathname.startsWith("/settings/") ? "active" : ""}`}
                    aria-label="Settings"
                    aria-current={
                      pathname === "/settings" ||
                      pathname.startsWith("/settings/")
                        ? "page"
                        : undefined
                    }
                    title="Settings"
                  >
                    <Settings2 size={20} />
                  </Link>
                </div>
              </header>
              <main id="main" className="main-content">
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                {children}
              </main>
            </div>
          </div>
        </RouteDataProviders>
      </ToastProvider>
    </ProfileContext.Provider>
  );
}
