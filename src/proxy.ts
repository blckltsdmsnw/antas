import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session on every matched request.
 *
 * Server Component clients (see `src/lib/supabase/server.ts`) cannot write
 * cookies — Next.js enforces that at runtime. When an expired access token
 * is refreshed there, the rotated (single-use) refresh token is discarded
 * instead of reaching the browser, so the next request replays an
 * already-invalidated refresh token and the user is silently logged out.
 *
 * This proxy is the other half of the pattern: it runs before rendering,
 * calls `getUser()` to trigger a refresh if needed, and writes any rotated
 * cookies onto the response so the browser actually receives them.
 *
 * Named `proxy`, not `middleware`: Next.js 16 deprecated the `middleware`
 * file convention and renamed it to `proxy`.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Keep the request's own cookie jar in sync in case anything
          // downstream in this middleware reads cookies again.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          // Rebuild the response from the updated request so the new
          // cookies are actually part of what gets sent to the browser.
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );

          // @supabase/ssr asks for these cache-control headers whenever it
          // writes auth cookies, so a CDN or reverse proxy in front of the
          // app never caches (and replays) another user's session.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run any logic between creating the client and this call —
  // it is what actually triggers the refresh and the `setAll` above.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - common static asset extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
