import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { AboutStructuredData } from "@/components/landing/about-structured-data";
import { BriefcaseBusiness, Bot, Users, Globe } from "lucide-react";
import type { Metadata } from "next";
import { APP_NAME } from "@ever-hust/utils";

export const metadata: Metadata = {
  title: "About",
  description:
    `Learn about ${APP_NAME}, the AI-powered job search platform that helps you find, apply, and land your dream job through natural conversation.`,
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: `About — ${APP_NAME}`,
    description:
      `Learn about ${APP_NAME}, the AI-powered job search platform helping job seekers worldwide.`,
    url: "/about",
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `About — ${APP_NAME}`,
    description:
      `Learn about ${APP_NAME}, the AI-powered job search platform helping job seekers worldwide.`,
  },
};

const VALUES = [
  {
    icon: Bot,
    title: "AI-First Experience",
    description:
      "We believe the future of job search is conversational. Our AI assistant understands your goals, preferences, and career trajectory to deliver truly personalized results.",
  },
  {
    icon: Users,
    title: "People Over Processes",
    description:
      "Job hunting is stressful enough. We build tools that remove friction, automate busywork, and let you focus on what matters: finding the right opportunity.",
  },
  {
    icon: Globe,
    title: "Open & Transparent",
    description:
      "We are committed to transparency in how our AI works, how your data is used, and how our pricing is structured. No hidden fees, no dark patterns.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Built for Job Seekers",
    description:
      "Every feature we ship is designed with job seekers in mind. From smart search and cover letter generation to interview prep and application tracking.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AboutStructuredData />
      <Navbar />
      <main id="main-content" className="flex-1">
        {/* Hero Section */}
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            About {APP_NAME}
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            {APP_NAME} is an AI-powered job search platform built by{" "}
            <a
              href="https://ever.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Ever Co. LTD
            </a>
            . We are reimagining how people find and land their next role by
            replacing traditional job boards with a conversational AI assistant
            that truly understands what you are looking for.
          </p>
        </div>

        {/* Mission Section */}
        <div className="border-y bg-muted/30">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight">Our Mission</h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              To make the job search process faster, smarter, and less
              stressful. We combine the latest advances in AI with a deep
              understanding of the hiring landscape to connect talented people
              with the right opportunities. Whether you are actively searching
              or just exploring, {APP_NAME} is your intelligent career companion.
            </p>
          </div>
        </div>

        {/* Values Section */}
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight">What We Believe</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {VALUES.map((value) => (
              <div key={value.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <value.icon
                    className="h-5 w-5 text-primary"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h3 className="text-base font-semibold">{value.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {value.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Section */}
        <div className="border-y bg-muted/30">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight">Our Team</h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              {APP_NAME} is built by a distributed team of engineers, designers,
              and AI researchers at Ever Co. LTD. We are passionate about using
              technology to solve real-world problems and are always looking for
              talented people to join us.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Interested in joining our team? Reach out at{" "}
              <a
                href="mailto:careers@hust.so"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                careers@hust.so
              </a>
              .
            </p>
          </div>
        </div>

        {/* Contact CTA */}
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Get in Touch</h2>
          <p className="mt-4 text-muted-foreground">
            Have questions, feedback, or partnership inquiries? We would love to
            hear from you.
          </p>
          <a
            href="/contact"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Contact Us
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
