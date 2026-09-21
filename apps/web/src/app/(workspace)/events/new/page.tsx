import { DuplicateEvent, EventForm } from "@/components/events/event-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; type?: string; duplicate?: string }>;
}) {
  const { date, type, duplicate } = await searchParams;
  if (duplicate) return <DuplicateEvent id={duplicate} />;
  return (
    <EventForm
      initialDate={date}
      initialType={type === "Vaccination" ? "Vaccination" : undefined}
    />
  );
}
