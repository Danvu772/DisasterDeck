// Login with SSOJet (OIDC) through Auth.js. Owner: Role 3.
// SSOJet says WHO you are. Our database says WHAT you may do (Final system design §9):
// nobody picks their own role, a new person is a citizen.
//
// Until Role 1 adds `email` to User, SSO_USER_MAP links a login email to a desk user:
//   SSO_USER_MAP="you@example.com=coordinator-duty,teammate@example.com=field-alpha"
// Anyone not in the map signs in as SSO_DEFAULT_USER (default "public-demo", a citizen).
// Pure env parsing, no database: this file also runs in middleware (edge runtime).
import NextAuth from "next-auth";

function deskUserFor(email: string | null | undefined): string {
  const fallback = process.env.SSO_DEFAULT_USER || "public-demo";
  if (!email) return fallback;
  for (const pair of (process.env.SSO_USER_MAP ?? "").split(",")) {
    const [mail, id] = pair.split("=").map((s) => s.trim());
    if (mail && id && mail.toLowerCase() === email.toLowerCase()) return id;
  }
  return fallback;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    {
      id: "ssojet",
      name: "SSOJet",
      type: "oidc",
      issuer: process.env.SSOJET_ISSUER_URL,
      clientId: process.env.SSOJET_CLIENT_ID,
      clientSecret: process.env.SSOJET_CLIENT_SECRET,
      authorization: { params: { scope: "openid profile email" } },
      checks: ["pkce", "state", "nonce"], // SSOJet needs `state`, and puts a `nonce` in the ID token
    },
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true, // laptops on localhost and the HTTPS tunnel both reach us
  callbacks: {
    jwt({ token, profile }) {
      // First sign-in only: profile is the SSOJet identity.
      if (profile) token.deskUserId = deskUserFor(profile.email ?? token.email);
      return token;
    },
    session({ session, token }) {
      if (typeof token.deskUserId === "string") session.user.id = token.deskUserId;
      return session;
    },
  },
});

/** The desk user id of whoever is signed in, or null. Used by the API routes. */
export async function sessionUserId(): Promise<string | null> {
  const s = await auth();
  return s?.user?.id ?? null;
}
