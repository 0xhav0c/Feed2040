import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

export async function requireAdmin(): Promise<{
  error: string | null;
  status: number;
  session: Session | null;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401, session: null };
  }
  if (session.user.role !== "admin") {
    return { error: "Forbidden", status: 403, session: null };
  }
  return { error: null, status: 200, session };
}
