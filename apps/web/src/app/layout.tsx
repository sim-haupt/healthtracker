import type { Metadata } from "next";
import { LanguageProvider } from "@/components/i18n";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Health tracker", template: "%s · Health tracker" },
  description: "Your private personal health tracker.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
