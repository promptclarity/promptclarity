import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ["/auth/signin", "/auth/signup", "/auth/error"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // Invite routes are public
  const isInviteRoute = pathname.startsWith("/invite");

  // API routes for auth need to be accessible
  const isAuthApi = pathname.startsWith("/api/auth");

  // Cron API routes use their own CRON_SECRET authentication
  const isCronApi = pathname.startsWith("/api/cron");

  // Instance status/setup routes must be public for first-run onboarding
  const isInstanceApi = pathname.startsWith("/api/instance");

  // Setup page must be public for first-run
  const isSetupPage = pathname === "/setup";

  if (isAuthApi || isCronApi || isPublicRoute || isInviteRoute || isInstanceApi || isSetupPage) {
    return NextResponse.next();
  }

  // Check for JWT token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Redirect to sign-in if not logged in
  if (!token) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
