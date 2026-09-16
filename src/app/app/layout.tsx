import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function AppRootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/app");
  return <>{children}</>;
}
