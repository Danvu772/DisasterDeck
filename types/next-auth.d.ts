// session.user.id is the desk user id (see auth.ts), not the SSOJet subject.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    deskUserId?: string;
  }
}
