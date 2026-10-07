import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/LegalDoc";
import { PRIVACY_SECTIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · jobcommand.app",
  description:
    "Official Privacy Policy: shop records, crew GPS, Stripe payouts, 1% invoice fee, AI by OpenAI (only with your OK), and HttpOnly session cookies.",
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      intro="Official Privacy Policy for jobcommand.app. It describes shop records, crew GPS while clocked in, Stripe card processing and merchant payouts, the 1% platform fee on invoices, the AI helper run by OpenAI (only after you allow it), account deletion, and the HttpOnly session cookie."
      sections={PRIVACY_SECTIONS}
    />
  );
}
