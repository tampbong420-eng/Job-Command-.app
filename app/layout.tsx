import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/command/ServiceWorker";
import { ScreenShield } from "@/components/command/ScreenShield";
import { SilentRecovery } from "@/components/command/SilentRecovery";
import { LogoBurst } from "@/components/command/LogoBurst";
import { ToastCenter } from "@/components/command/ToastCenter";
import { NewUserOpen } from "@/components/command/NewUserOpen";
import { InactivityLock } from "@/components/command/InactivityLock";
import { ShopPlaceProvider } from "@/components/command/ShopPlace";
import { loadShopIdentity } from "@/lib/shop-identity-server";
import "./globals.css";
import "./job-active.css";
import "./ui-batch.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/** App brand. Each shop's own name comes from its settings (sign-up / Company), never from code. */
const APP_NAME = "Job Command.app";

export async function generateMetadata(): Promise<Metadata> {
  const shop = await loadShopIdentity();
  const name = shop.name || APP_NAME;
  return {
    title: name,
    description: shop.name
      ? `Jobs, estimates, crew, and hours for ${shop.name}.`
      : "Jobs, estimates, crew, and hours for your contracting shop.",
    applicationName: APP_NAME,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: APP_NAME,
    },
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#0d0d0d",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shop = await loadShopIdentity();
  return (
    <html lang="en" className={`dark ${inter.variable} ${inter.className}`} suppressHydrationWarning>
      <body className="app-font-refined">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <SilentRecovery>
            <ShopPlaceProvider value={shop}>{children}</ShopPlaceProvider>
            <ScreenShield />
            <ServiceWorkerRegister />
            <Toaster position="top-center" offset={18} />
            <ToastCenter />
            <NewUserOpen />
            <LogoBurst />
            <InactivityLock />
          </SilentRecovery>
        </ThemeProvider>
      </body>
    </html>
  );
}
