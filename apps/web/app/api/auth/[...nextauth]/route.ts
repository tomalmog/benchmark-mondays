import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { prisma } from "@/lib/db";

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      try {
        if (!profile) return true; // let it through, handle in session callback

        const githubId = String((profile as { id?: number }).id || "");
        const githubLogin = (profile as { login?: string }).login || "unknown";

        if (!githubId) return true;

        // Try to find existing user first
        const existing = await prisma.user.findFirst({
          where: { githubId },
        });

        if (existing) {
          // Update login if changed
          if (existing.githubLogin !== githubLogin) {
            await prisma.user.update({
              where: { id: existing.id },
              data: { githubLogin },
            });
          }
        } else {
          // Create new user
          await prisma.user.create({
            data: { githubId, githubLogin },
          });
        }

        return true;
      } catch (err) {
        console.error("[auth] signIn error:", err);
        return true; // still allow sign in even if DB fails
      }
    },

    async session({ session, token }) {
      if (token.sub && session.user) {
        const user = await prisma.user.findFirst({
          where: { githubId: token.sub },
        });
        if (user) {
          (session.user as { id?: string }).id = user.id;
          (session.user as { githubLogin?: string }).githubLogin = user.githubLogin;
        }
      }
      return session;
    },

    async jwt({ token, profile }) {
      if (profile) {
        token.sub = String((profile as { id?: number }).id || "");
      }
      return token;
    },
  },
  pages: {
    signIn: "/", // skip NextAuth's built-in sign-in page
    error: "/",  // redirect errors to home
  },
});

export { handler as GET, handler as POST };
