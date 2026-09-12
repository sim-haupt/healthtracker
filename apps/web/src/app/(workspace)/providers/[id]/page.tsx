import { ProviderDetail } from "@/components/providers";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProviderDetail key={id} id={id} />;
}
