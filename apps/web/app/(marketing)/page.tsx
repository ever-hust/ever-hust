import type { Metadata } from "next";
import { APP_NAME } from "@ever-hust/utils";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Integrations } from "@/components/landing/integrations";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PricingSection } from "@/components/landing/pricing-section";
import { Testimonials } from "@/components/landing/testimonials";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { StructuredData } from "@/components/landing/structured-data";

export const metadata: Metadata = {
  title: `${APP_NAME} - AI-Powered Job Search Assistant`,
  description:
    "Chat with AI to search 50+ job boards, generate tailored cover letters, and land your dream job — all through natural conversation.",
  openGraph: {
    title: `${APP_NAME} - AI-Powered Job Search Assistant`,
    description:
      "Chat with AI to search 50+ job boards, generate tailored cover letters, and land your dream job.",
    url: "/",
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} - AI-Powered Job Search Assistant`,
    description:
      "Chat with AI to search 50+ job boards, generate tailored cover letters, and land your dream job.",
  },
  alternates: {
    canonical: "/",
  },
};

// ISR: revalidate landing page every hour
export const revalidate = 3600;

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <StructuredData />
      <Navbar />
      <main id="main-content" className="flex-1">
        <Hero />
        <Integrations />
        <Features />
        <HowItWorks />
        <PricingSection />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
