export type Provider = {
  id: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
};
export type ProviderInput = Omit<Provider, "id" | "created_at">;
