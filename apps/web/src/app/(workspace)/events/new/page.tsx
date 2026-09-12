import { EventForm } from "@/components/events/event-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; type?: string }>;
}) {
  const { date, type } = await searchParams;
  return (
    <EventForm
      initialDate={date}
      initialType={type === "Vaccination" ? "Vaccination" : undefined}
    />
  );
}
