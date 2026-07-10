import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase session on a response. Returns both the (possibly
 * augmented) response and the current user so the caller can chain it with
 * next-intl's response WITHOUT dropping Set-Cookie headers.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getSession() reads the JWT from the cookie (no network round-trip).
  // Middleware is redirect-only — authorization checks in route layouts use getUser().
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { response, user: session?.user ?? null, supabase };
}
