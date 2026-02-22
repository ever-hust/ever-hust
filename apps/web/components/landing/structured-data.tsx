import { APP_NAME } from "@ever-hust/utils";

export function StructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://everjobs.ai";

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: APP_NAME,
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    description:
      "AI-powered job search assistant. Find, apply, and land your dream job through natural conversation.",
    sameAs: [
      "https://github.com/ever-co",
      "https://twitter.com/evaborjobs",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${baseUrl}/contact`,
    },
  };

  const webSite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APP_NAME,
    url: baseUrl,
    description:
      "Chat with AI to find jobs across 50+ boards, generate personalized cover letters, and get interview prep.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/dashboard?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: APP_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        name: "Free",
      },
      {
        "@type": "Offer",
        price: "36",
        priceCurrency: "USD",
        name: "Quarterly",
        description: "Billed $36 every 3 months ($12/mo)",
      },
      {
        "@type": "Offer",
        price: "84",
        priceCurrency: "USD",
        name: "Annual",
        description: "Billed $84 per year ($7/mo)",
      },
    ],
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Can I cancel anytime?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.",
        },
      },
      {
        "@type": "Question",
        name: "Is there a free trial?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! All paid plans come with a 7-day free trial. No credit card required to start.",
        },
      },
      {
        "@type": "Question",
        name: "What happens when I hit the free plan limits?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "You'll see a friendly upgrade prompt. Your data and saved jobs are never lost — just upgrade to continue where you left off.",
        },
      },
      {
        "@type": "Question",
        name: "Can I bring my own API key?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Absolutely. Pro users can bring their own Anthropic, OpenAI, or Google AI keys in Settings to use their preferred models.",
        },
      },
      {
        "@type": "Question",
        name: "Do you store my data securely?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. All data is encrypted at rest and in transit. API keys are encrypted with AES-256. We never sell your data.",
        },
      },
    ],
  };

  // Escape closing script tags in JSON-LD to prevent XSS via crafted data
  // containing "</script>".
  const safeStringify = (data: object) =>
    JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeStringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeStringify(webSite) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeStringify(softwareApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeStringify(faqPage) }}
      />
    </>
  );
}
