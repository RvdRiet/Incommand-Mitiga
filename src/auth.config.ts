import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user && "tenantId" in user) {
        token.tenantId = user.tenantId as string;
        token.userId = user.id;
        token.role = user.role as string;
        token.organizationId = user.organizationId as string;
      }
      return token;
    },
    session({ session, token }) {
      const tenantId = typeof token.tenantId === "string" ? token.tenantId : undefined;
      const userId = typeof token.userId === "string" ? token.userId : undefined;
      if (tenantId && userId) {
        session.tenantId = tenantId;
        session.userId = userId;
        session.role = typeof token.role === "string" ? token.role : "viewer";
        session.mustChangePassword = token.mustChangePassword === true;
        session.organizationId =
          typeof token.organizationId === "string" ? token.organizationId : "";
        session.user = {
          ...session.user,
          id: userId,
          email: session.user?.email ?? "",
        };
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
