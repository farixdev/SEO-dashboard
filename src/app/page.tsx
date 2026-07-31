import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

/** Middleware normally handles this; kept as a belt-and-braces fallback. */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "CLIENT" ? "/portal" : "/app");
}
