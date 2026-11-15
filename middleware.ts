// Signed-out visitors go to /login. With DEMO_MODE=1 nothing is gated for requests from this
// laptop (isLocalDemo), so the ?user= role picker keeps working there. Anything through a
// tunnel, a proxy or the network signs in (#11). Owner: Role 3.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isLocalDemo } from "@/lib/localDemo";

const OPEN = ["/login", "/lab", "/family"];

export default auth((req) => {
  if (req.auth || isLocalDemo(req)) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const login = new URL("/login", req.url);
  login.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
