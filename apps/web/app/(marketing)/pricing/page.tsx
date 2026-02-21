import { Navbar } from "@/components/landing/navbar";
import { PricingSection } from "@/components/landing/pricing-section";
import { Footer } from "@/components/landing/footer";
import { PricingStructuredData } from "@/components/landing/pricing-structured-data";
import type { Metadata } from "next";

// ISR: revalidate pricing page every hour
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for Ever Jobs. Start free, upgrade when you need more power.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing — Ever Jobs",
    description:
      "Start free with 5 daily searches and 50 AI messages. Upgrade to Pro for unlimited access from $7/mo.",
    url: "/pricing",
    images: [
      {
        url: "/api/og?title=Simple%2C%20Transparent%20Pricing&description=Start%20free.%20Upgrade%20when%20you%20need%20more%20power.",
        width: 1200,
        height: 630,
        alt: "Ever Jobs Pricing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — Ever Jobs",
    description:
      "Start free with 5 daily searches and 50 AI messages. Upgrade to Pro for unlimited access from $7/mo.",
  },
};

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PricingStructuredData />
      <Navbar />
      <main id="main-content" className="flex-1">
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
