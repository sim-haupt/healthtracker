import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const isLogin = request.nextUrl.pathname === "/login";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const redirectToLogin = () => {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };
  if (!url || !key) return isLogin ? response : redirectToLogin();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  try {
    // Verify with Auth, not the untrusted session payload from cookies.
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if ((error || !user) && !isLogin) return redirectToLogin();
  } catch {
    if (!isLogin) return redirectToLogin();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/calendar/:path*",
    "/events/:path*",
    "/episodes/:path*",
    "/settings/:path*",
    "/timeline/:path*",
    "/documents/:path*",
    "/providers/:path*",
    "/vaccinations/:path*",
  ],
};
