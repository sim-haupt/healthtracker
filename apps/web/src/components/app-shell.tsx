"use client";
import { ProvidersProvider } from "./providers-context";
import { ToastProvider } from "./ui/feedback";
import { ProfileAvatar } from "./ui/profile-avatar";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  Activity,
  LayoutDashboard,
  CalendarDays,
  ListTodo,
  History,
  Files,
  Layers,
  Stethoscope,
  Syringe,
  Settings2,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { TrackerProvider } from "./tracker/context";
import { supabase } from "@/lib/supabase";
import { apiFetch, ApiError } from "@/lib/api";
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
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/vaccinations", label: "Vaccinations", icon: Syringe },
  { href: "/timeline", label: "Timeline", icon: History },
  { href: "/documents", label: "Documents", icon: Files },
  { href: "/episodes", label: "Health episodes", icon: Layers },
  { href: "/events", label: "Events", icon: ListTodo },
  { href: "/providers", label: "Medical Providers", icon: Stethoscope },
  { href: "/settings", label: "Settings", icon: Settings2 },
];
export function AppShell({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const activeProfile = profiles.find((item) => item.id === profileId) ?? null;
  useEffect(() => {
    if (!supabase) {
      router.replace("/login");
      return;
    }
    let active = true;
    const controller = new AbortController();
    apiFetch<{ profiles: HealthProfile[] }>(
      "/api/v1/profiles",
      controller.signal,
    )
      .then(({ profiles: loaded }) => {
        if (!active) return;
        if (!loaded.length) {
          setError(
            "No health profiles are available. Contact the workspace owner.",
          );
          return;
        }
        setProfiles(loaded);

        setReady(true);
      })
      .catch((e: Error) => {
        if (!active) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace(
            e.status === 403 ? "/login?access=unavailable" : "/login",
          );
        } else setError(e.message);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user.id !== userId) {
        active = false;
        controller.abort();
        setReady(false);
        setProfiles([]);
        window.location.replace("/dashboard");
        return;
      }
      if (event === "SIGNED_OUT") {
        active = false;
        controller.abort();
        setReady(false);
        setProfiles([]);
        window.location.replace("/login");
      }
    });
    return () => {
      active = false;
      controller.abort();
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
        <ProvidersProvider>
          <TrackerProvider>
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
                        navigation.find(
                          (n) =>
                            pathname === n.href ||
                            pathname.startsWith(`${n.href}/`),
                        )?.label
                      }
                    </strong>
                  </div>
                  <div className="profile-control">
                    <ProfileAvatar
                      name={activeProfile?.name ?? "Both profiles"}
                      avatar={activeProfile?.avatar}
                    />
                    <label className="sr-only" htmlFor="profile">
                      Active health profile
                    </label>
                    <select
                      id="profile"
                      value={profileId}
                      onChange={(e) => setProfileId(e.target.value)}
                    >
                      <option value="">Both profiles</option>
                      {profiles.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} />
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
          </TrackerProvider>
        </ProvidersProvider>
      </ToastProvider>
    </ProfileContext.Provider>
  );
}
