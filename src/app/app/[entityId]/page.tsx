import { redirect } from "next/navigation";
export default async function EntityIndex({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  redirect(`/app/${entityId}/dashboard`);
}
