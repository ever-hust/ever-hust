import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Ever Jobs collects, uses, and protects your personal information.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy — Ever Jobs",
    description:
      "Learn how Ever Jobs collects, uses, and protects your personal information.",
    url: "/privacy",
    siteName: "Ever Jobs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy — Ever Jobs",
    description:
      "Learn how Ever Jobs collects, uses, and protects your personal information.",
  },
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: February 18, 2026
          </p>

          <div className="mt-12 space-y-10 text-sm leading-7 text-muted-foreground">
            {/* 1. Information We Collect */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                1. Information We Collect
              </h2>
              <p className="mt-3">
                When you use Ever Jobs, we collect information you provide
                directly to us, including:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">Account information:</strong>{" "}
                  Your name, email address, profile photo, and LinkedIn profile
                  data provided during authentication.
                </li>
                <li>
                  <strong className="text-foreground">Profile data:</strong>{" "}
                  Skills, work experience, education, location preferences, and
                  any resume or CV you upload.
                </li>
                <li>
                  <strong className="text-foreground">Chat history:</strong>{" "}
                  Messages you exchange with our AI assistant, including job
                  search queries, cover letter requests, and interview
                  preparation conversations.
                </li>
                <li>
                  <strong className="text-foreground">Usage data:</strong>{" "}
                  Information about how you interact with the Service, including
                  pages visited, features used, job listings viewed, and search
                  queries.
                </li>
                <li>
                  <strong className="text-foreground">Payment information:</strong>{" "}
                  Billing details processed securely through Stripe. We do not
                  store your full credit card number on our servers.
                </li>
              </ul>
            </section>

            {/* 2. How We Use Information */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                2. How We Use Your Information
              </h2>
              <p className="mt-3">We use the information we collect to:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  Provide, maintain, and improve the Service, including
                  personalized job recommendations and AI-generated content.
                </li>
                <li>
                  Process transactions and send related billing communications.
                </li>
                <li>
                  Send you job alerts, platform updates, and promotional
                  communications (which you can opt out of at any time).
                </li>
                <li>
                  Analyze usage patterns to improve our AI models, search
                  algorithms, and overall user experience.
                </li>
                <li>
                  Detect, prevent, and address fraud, abuse, and technical
                  issues.
                </li>
                <li>
                  Comply with legal obligations and enforce our Terms of
                  Service.
                </li>
              </ul>
            </section>

            {/* 3. Data Sharing */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                3. Data Sharing
              </h2>
              <p className="mt-3">
                We do not sell your personal information. We may share your
                information in the following circumstances:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">Service providers:</strong>{" "}
                  We share data with trusted third-party providers who assist us
                  in operating the Service, including Stripe (payments),
                  Supabase (database hosting), Anthropic and OpenRouter (AI
                  model providers), Resend (email delivery), and Vercel
                  (hosting).
                </li>
                <li>
                  <strong className="text-foreground">AI model providers:</strong>{" "}
                  Portions of your chat messages are sent to AI model providers
                  (such as Anthropic) for processing. These providers have their
                  own privacy policies governing how they handle data.
                </li>
                <li>
                  <strong className="text-foreground">Legal requirements:</strong>{" "}
                  We may disclose information if required to do so by law or in
                  response to valid legal processes.
                </li>
                <li>
                  <strong className="text-foreground">Business transfers:</strong>{" "}
                  In connection with a merger, acquisition, or sale of assets,
                  your information may be transferred as part of that
                  transaction.
                </li>
              </ul>
            </section>

            {/* 4. Cookies & Tracking */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                4. Cookies &amp; Tracking Technologies
              </h2>
              <p className="mt-3">
                We use cookies and similar technologies to maintain your
                session, remember your preferences, and analyze how you use the
                Service. Specifically:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">Session cookies:</strong>{" "}
                  Essential for authentication and keeping you signed in.
                </li>
                <li>
                  <strong className="text-foreground">Preference cookies:</strong>{" "}
                  Store your settings such as theme preference and AI model
                  selection.
                </li>
                <li>
                  <strong className="text-foreground">Analytics:</strong> We use
                  AI observability tools (Langfuse) to monitor and improve the
                  performance of our AI features. These tools collect anonymized
                  interaction data.
                </li>
              </ul>
              <p className="mt-3">
                You can control cookies through your browser settings. Disabling
                essential cookies may prevent you from using certain features of
                the Service.
              </p>
            </section>

            {/* 5. Your Rights */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                5. Your Rights
              </h2>
              <p className="mt-3">
                Depending on your jurisdiction, you may have the following
                rights regarding your personal data:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">Access:</strong> Request a
                  copy of the personal data we hold about you.
                </li>
                <li>
                  <strong className="text-foreground">Correction:</strong>{" "}
                  Request that we correct inaccurate or incomplete data.
                </li>
                <li>
                  <strong className="text-foreground">Deletion:</strong> Request
                  that we delete your personal data, subject to certain legal
                  exceptions.
                </li>
                <li>
                  <strong className="text-foreground">Portability:</strong>{" "}
                  Request a machine-readable copy of your data.
                </li>
                <li>
                  <strong className="text-foreground">Objection:</strong> Object
                  to the processing of your data for certain purposes, including
                  direct marketing.
                </li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, please contact us at{" "}
                <a
                  href="mailto:privacy@everjobs.ai"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  privacy@everjobs.ai
                </a>
                . We will respond to your request within 30 days.
              </p>
            </section>

            {/* 6. Data Retention */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                6. Data Retention
              </h2>
              <p className="mt-3">
                We retain your personal data for as long as your account is
                active or as needed to provide you with the Service. Chat
                history is retained to maintain conversational context and
                improve recommendations. If you delete your account, we will
                remove your personal data within 30 days, except where retention
                is required by law or for legitimate business purposes (such as
                fraud prevention or financial record-keeping).
              </p>
              <p className="mt-3">
                Anonymized and aggregated data that cannot be used to identify
                you may be retained indefinitely for analytics and service
                improvement.
              </p>
            </section>

            {/* 7. Data Security */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                7. Data Security
              </h2>
              <p className="mt-3">
                We implement industry-standard security measures to protect your
                data, including encryption in transit (TLS/HTTPS), encryption at
                rest, secure authentication via OAuth, Content Security Policy
                headers, and regular security reviews. However, no method of
                electronic storage or transmission is 100% secure, and we cannot
                guarantee absolute security.
              </p>
            </section>

            {/* 8. Children's Privacy */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                8. Children&apos;s Privacy
              </h2>
              <p className="mt-3">
                The Service is not intended for individuals under the age of 16.
                We do not knowingly collect personal information from children
                under 16. If we become aware that we have collected personal
                data from a child under 16, we will take steps to delete that
                information promptly.
              </p>
            </section>

            {/* 9. Changes to This Policy */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                9. Changes to This Policy
              </h2>
              <p className="mt-3">
                We may update this Privacy Policy from time to time. We will
                notify you of material changes by posting the updated policy on
                this page and updating the &quot;Last updated&quot; date. Your
                continued use of the Service after any changes constitutes your
                acceptance of the revised policy.
              </p>
            </section>

            {/* 10. Contact */}
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                10. Contact Us
              </h2>
              <p className="mt-3">
                If you have questions or concerns about this Privacy Policy or
                our data practices, please contact us at{" "}
                <a
                  href="mailto:privacy@everjobs.ai"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  privacy@everjobs.ai
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
