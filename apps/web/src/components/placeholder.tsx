import { CalendarDays, Settings2 } from "lucide-react";
const content = {
  calendar: {
    title: "Calendar",
    subtitle: "",
    heading: "Calendar",
    text: "Appointments and reminders will have a home here. Calendar features are coming in a future update.",
    icon: CalendarDays,
  },
  settings: {
    title: "Settings",
    subtitle: "",
    heading: "Settings",
    text: "This tracker is designed for two health profiles within one private workspace. Profile editing and preferences are coming in a future update.",
    icon: Settings2,
  },
};
export function Placeholder({ kind }: { kind: keyof typeof content }) {
  const item = content[kind];
  const Icon = item.icon;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{item.title}</h1>
          <p>{item.subtitle}</p>
        </div>
        <span className="pill">Coming soon</span>
      </div>
      <section className="card empty-page">
        <div className="empty-icon">
          <Icon size={32} />
        </div>
        <h2>{item.heading}</h2>
        <p>{item.text}</p>
        <span className="subtle-label">
          No health information has been added.
        </span>
      </section>
    </>
  );
}
