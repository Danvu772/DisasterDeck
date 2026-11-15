// Signed-out visitors go to /login. With DEMO_MODE=1 (our laptops) nothing is gated,
// so the ?user= role picker keeps working as the fallback. Owner: Role 3.
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const OPEN = ["/login", "/lab"];

export default auth((req) => {
  if (process.env.DEMO_MODE === "1" || req.auth) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const login = new URL("/login", req.url);
  login.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
