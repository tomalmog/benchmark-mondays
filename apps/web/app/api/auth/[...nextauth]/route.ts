import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { prisma } from "@/lib/db";

const CALLBACK_URL = "https://www.tomalmog.com/bmm/api/auth/callback/github";

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          redirect_uri: CALLBACK_URL,
        },
      },
      token: {
        url: "https://github.com/login/oauth/access_token",
        params: {
          redirect_uri: CALLBACK_URL,
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      try {
        if (!profile) return true;

        const githubId = String((profile as { id?: number }).id || "");
        const githubLogin = (profile as { login?: string }).login || "unknown";

        if (!githubId) return true;

        const existing = await prisma.user.findFirst({ where: { githubId } });

        if (existing) {
          if (existing.githubLogin !== githubLogin) {
            await prisma.user.update({ where: { id: existing.id }, data: { githubLogin } });
          }
        } else {
          await prisma.user.create({ data: { githubId, githubLogin } });
        }

        return true;
      } catch (err) {
        console.error("[auth] signIn error:", err);
        return true;
      }
    },

    async session({ session, token }) {
      if (token.sub && session.user) {
        const user = await prisma.user.findFirst({ where: { githubId: token.sub } });
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
    signIn: "/bmm",
    error: "/bmm",
  },
});

export { handler as GET, handler as POST };
