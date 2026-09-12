import { LoginForm } from "@/components/login-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ access?: string }>;
}) {
  const { access } = await searchParams;
  return <LoginForm accessUnavailable={access === "unavailable"} />;
}
