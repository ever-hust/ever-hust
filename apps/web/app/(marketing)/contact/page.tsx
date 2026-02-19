import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { Mail, MessageSquare, Building } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Ever Jobs team. We are here to help with support, partnerships, and general inquiries.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact — Ever Jobs",
    description:
      "Get in touch with the Ever Jobs team for support, partnerships, or general inquiries.",
    url: "/contact",
    siteName: "Ever Jobs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact — Ever Jobs",
    description:
      "Get in touch with the Ever Jobs team for support, partnerships, or general inquiries.",
  },
};

const CONTACT_CHANNELS = [
  {
    icon: Mail,
    title: "General Inquiries",
    description:
      "For general questions about Ever Jobs, our platform, or how to get started.",
    email: "hello@everjobs.ai",
  },
  {
    icon: MessageSquare,
    title: "Support",
    description:
      "Need help with your account, billing, or a technical issue? Our support team is here for you.",
    email: "support@everjobs.ai",
  },
  {
    icon: Building,
    title: "Partnerships & Enterprise",
    description:
      "Interested in integrating Ever Jobs into your organization, or exploring a partnership?",
    email: "partnerships@everjobs.ai",
  },
];

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">Contact Us</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            We would love to hear from you. Whether you have a question about
            features, pricing, or anything else, our team is ready to help.
          </p>

          {/* Contact Channels */}
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {CONTACT_CHANNELS.map((channel) => (
              <div
                key={channel.title}
                className="rounded-lg border bg-card p-6 shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <channel.icon
                    className="h-5 w-5 text-primary"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-4 text-base font-semibold">
                  {channel.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {channel.description}
                </p>
                <a
                  href={`mailto:${channel.email}`}
                  className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {channel.email}
                </a>
              </div>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-16 rounded-lg border bg-muted/30 p-8">
            <h2 className="text-xl font-semibold">Company Information</h2>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Company:</strong> Ever Co.
                LTD
              </p>
              <p>
                <strong className="text-foreground">Website:</strong>{" "}
                <a
                  href="https://ever.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  ever.co
                </a>
              </p>
              <p>
                <strong className="text-foreground">Platform:</strong>{" "}
                <a
                  href="https://everjobs.ai"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  everjobs.ai
                </a>
              </p>
              <p>
                <strong className="text-foreground">GitHub:</strong>{" "}
                <a
                  href="https://github.com/ever-co"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  github.com/ever-co
                </a>
              </p>
            </div>
          </div>

          {/* Response Time */}
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              We typically respond to inquiries within 1-2 business days.
              <br />
              For urgent matters, please include &quot;URGENT&quot; in your
              email subject line.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
