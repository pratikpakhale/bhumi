import type { NextRequest } from "next/server";
import { accountBody, readBody, withHandler } from "@/lib/api";
import { signIn, signOut, signUp } from "@/lib/accounts";

/** Sign in, create an account, or sign out. */
export async function POST(req: NextRequest) {
  return withHandler(async () => {
    const body = await readBody(req, accountBody);
    switch (body.action) {
      case "sign-in":
        return { username: await signIn(body.username, body.password) };
      case "sign-up":
        return { username: await signUp(body.username, body.password) };
      case "sign-out":
        await signOut();
        return { username: null };
    }
  });
}
