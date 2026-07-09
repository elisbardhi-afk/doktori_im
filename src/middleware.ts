import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Chain: next-intl produces the response (locale cookie/redirect), then we
 * refresh the Supabase session ON THAT SAME response so Set-Cookie headers are
 * preserved. Role-based redirects are enforced in the route-group layouts
 * (which can read the DB), keeping middleware fast and redirect-only.
 */
export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  const { response: finalResponse } = await updateSession(request, response);
  return finalResponse;
}

export const config = {
  // Skip Next internals and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
