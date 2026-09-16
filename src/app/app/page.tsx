import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { listEntitiesForUser } from "@/lib/dal/entities";

export default async function AppIndex({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const user = await requireUser();
  const { invite } = await searchParams;
  if (invite) redirect(`/app/invite/${invite}`);
  const memberships = await listEntitiesForUser(user.id);
  if (memberships.length === 0) redirect("/app/new");
  const db = await getDb();
  const [u] = await db.select({ last: users.lastEntityId }).from(users).where(eq(users.id, user.id));
  const target = memberships.find((m) => m.entity.id === u?.last) ?? memberships[0];
  redirect(`/app/${target.entity.id}/dashboard`);
}
