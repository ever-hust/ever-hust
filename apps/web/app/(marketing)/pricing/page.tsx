import { Navbar } from "@/components/landing/navbar";
import { PricingSection } from "@/components/landing/pricing-section";
import { Footer } from "@/components/landing/footer";
import type { Metadata } from "next";

// ISR: revalidate pricing page every hour
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for Ever Jobs. Start free, upgrade when you need more power.",
};

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main id="main-content" className="flex-1">
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
