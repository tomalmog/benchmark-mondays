import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      return !!profile;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id =
          typeof token.sub === "string" ? token.sub : undefined;
        (session.user as { githubLogin?: string }).githubLogin =
          typeof token.githubLogin === "string" ? token.githubLogin : undefined;
      }
      return session;
    },

    async jwt({ token, profile }) {
      if (profile) {
        token.sub = String((profile as { id?: number }).id || "");
        token.githubLogin = (profile as { login?: string }).login || "";
      }
      return token;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
});

export { handler as GET, handler as POST };
