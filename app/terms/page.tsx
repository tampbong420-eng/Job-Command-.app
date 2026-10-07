import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/LegalDoc";
import { TERMS_SECTIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & Conditions · jobcommand.app",
  description:
    "Official Terms & Conditions: 30-day Base App trial ($199/mo or $1,990/yr, $1 card check released right away, one trial per business), AI answering +$59/mo, auto-renewal, cancellation, Stripe Connect 1% fee, and job-site liability.",
};

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms & Conditions"
      intro="Official Terms & Conditions for jobcommand.app. Read this before you finish signup. It covers the 30-day free trial of the Base App ($199/mo or $1,990/yr, a $1 card check at signup that is released right away; one free trial per business), the AI Answering Service add-on (+$59/mo), auto-renewal and cancellation, Stripe Connect merchant payouts, the automated 1% platform fee, and limitation of liability for field operations, crew hours, estimates, and job-site safety notes."
      sections={TERMS_SECTIONS}
    />
  );
}
