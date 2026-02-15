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
