import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read the Terms of Service for Ever Jobs, the AI-powered job search platform.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Service — Ever Jobs",
    description:
      "Read the Terms of Service for Ever Jobs, the AI-powered job search platform.",
    url: "/terms",
    siteName: "Ever Jobs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service — Ever Jobs",
    description:
      "Read the Terms of Service for Ever Jobs, the AI-powered job search platform.",
  },
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Terms of Service
          </h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: February 18, 2026
          </p>

          <div className="mt-12 space-y-10 text-sm leading-7 text-muted-foreground">
            {/* 1. Acceptance of Terms */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                1. Acceptance of Terms
              </h2>
              <p className="mt-3">
                By accessing or using the Ever Jobs platform
                (&quot;Service&quot;), operated by Ever Co. LTD
                (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or
                &quot;our&quot;), you agree to be bound by these Terms of
                Service (&quot;Terms&quot;). If you do not agree to these Terms,
                you may not access or use the Service. We reserve the right to
                update these Terms at any time. Continued use of the Service
                after any modifications constitutes your acceptance of the
                revised Terms.
              </p>
            </section>

            {/* 2. Use of Service */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                2. Use of Service
              </h2>
              <p className="mt-3">
                Ever Jobs provides an AI-powered conversational job search
                assistant. You may use the Service to search for job listings,
                receive personalized job recommendations, generate cover
                letters, prepare for interviews, and manage your job
                applications. You agree to use the Service only for lawful
                purposes and in compliance with all applicable laws and
                regulations.
              </p>
              <p className="mt-3">
                You must not use the Service to: (a) submit false, misleading,
                or fraudulent information; (b) scrape, harvest, or collect data
                from the Service by automated means without our express written
                consent; (c) interfere with, disrupt, or place an unreasonable
                load on the Service infrastructure; or (d) attempt to gain
                unauthorized access to any part of the Service.
              </p>
            </section>

            {/* 3. User Accounts */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                3. User Accounts
              </h2>
              <p className="mt-3">
                To access certain features of the Service, you must create an
                account by authenticating through LinkedIn OAuth or another
                supported authentication provider. You are responsible for
                maintaining the confidentiality of your account credentials and
                for all activities that occur under your account. You agree to
                notify us immediately of any unauthorized use of your account.
              </p>
              <p className="mt-3">
                We reserve the right to suspend or terminate your account at any
                time if we reasonably believe you have violated these Terms or
                engaged in conduct that is harmful to other users, the Company,
                or third parties.
              </p>
            </section>

            {/* 4. Subscription Plans & Payments */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                4. Subscription Plans &amp; Payments
              </h2>
              <p className="mt-3">
                Ever Jobs offers a free tier with limited features and paid
                subscription plans (&quot;Pro&quot;) with enhanced capabilities.
                Paid subscriptions are billed through Stripe on a recurring
                basis (monthly, quarterly, or annual). By subscribing to a paid
                plan, you authorize us to charge the applicable fees to your
                selected payment method.
              </p>
              <p className="mt-3">
                You may cancel your subscription at any time through your
                account settings. Cancellations take effect at the end of the
                current billing period. We do not provide refunds for partial
                billing periods unless required by applicable law.
              </p>
            </section>

            {/* 5. Intellectual Property */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                5. Intellectual Property
              </h2>
              <p className="mt-3">
                All content, features, and functionality of the Service,
                including but not limited to text, graphics, logos, icons,
                images, software, and the AI models and algorithms powering the
                Service, are the exclusive property of Ever Co. LTD or its
                licensors and are protected by international copyright,
                trademark, patent, and other intellectual property laws.
              </p>
              <p className="mt-3">
                Content you generate through the Service (such as cover letters
                or interview preparation materials) is yours to use. However,
                you grant us a non-exclusive, royalty-free license to use
                anonymized and aggregated data derived from your usage to
                improve the Service.
              </p>
            </section>

            {/* 6. AI-Generated Content Disclaimer */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                6. AI-Generated Content Disclaimer
              </h2>
              <p className="mt-3">
                The Service uses artificial intelligence to provide job
                recommendations, generate cover letters, offer interview
                preparation assistance, and other features. AI-generated content
                is provided on an &quot;as-is&quot; basis for informational
                purposes only. We do not guarantee the accuracy, completeness,
                or suitability of any AI-generated content. You are solely
                responsible for reviewing and verifying all AI-generated content
                before using it in any professional or personal context.
              </p>
            </section>

            {/* 7. Limitation of Liability */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                7. Limitation of Liability
              </h2>
              <p className="mt-3">
                To the maximum extent permitted by applicable law, Ever Co. LTD
                and its officers, directors, employees, and agents shall not be
                liable for any indirect, incidental, special, consequential, or
                punitive damages, including but not limited to loss of profits,
                data, use, or goodwill, arising out of or in connection with
                your use of the Service.
              </p>
              <p className="mt-3">
                Our total cumulative liability for any claims arising from your
                use of the Service shall not exceed the amount you have paid us
                in the twelve (12) months preceding the event giving rise to
                such liability, or one hundred US dollars ($100), whichever is
                greater.
              </p>
            </section>

            {/* 8. Termination */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                8. Termination
              </h2>
              <p className="mt-3">
                We may terminate or suspend your access to the Service at any
                time, with or without cause, and with or without notice. Upon
                termination, your right to use the Service will immediately
                cease. All provisions of these Terms that by their nature should
                survive termination shall survive, including but not limited to
                ownership provisions, warranty disclaimers, and limitations of
                liability.
              </p>
              <p className="mt-3">
                You may delete your account at any time by contacting us at{" "}
                <a
                  href="mailto:legal@everjobs.ai"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  legal@everjobs.ai
                </a>
                . Upon account deletion, we will remove your personal data in
                accordance with our Privacy Policy.
              </p>
            </section>

            {/* 9. Governing Law */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                9. Governing Law
              </h2>
              <p className="mt-3">
                These Terms shall be governed by and construed in accordance
                with the laws of the jurisdiction in which Ever Co. LTD is
                incorporated, without regard to its conflict of law provisions.
                Any disputes arising under or in connection with these Terms
                shall be subject to the exclusive jurisdiction of the courts
                located in that jurisdiction.
              </p>
            </section>

            {/* 10. Contact */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                10. Contact Us
              </h2>
              <p className="mt-3">
                If you have any questions about these Terms, please contact us
                at{" "}
                <a
                  href="mailto:legal@everjobs.ai"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  legal@everjobs.ai
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
