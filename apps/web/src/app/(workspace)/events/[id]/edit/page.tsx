import { EditEvent } from "@/components/events/event-form";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditEvent id={id} />;
}
