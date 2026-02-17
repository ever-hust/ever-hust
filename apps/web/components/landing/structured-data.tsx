export function StructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://everjobs.ai";

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Ever Jobs",
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
    name: "Ever Jobs",
    url: baseUrl,
    description:
      "Chat with AI to find jobs across 50+ boards, generate personalized cover letters, and get interview prep.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/chat?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Ever Jobs",
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
        price: "12",
        priceCurrency: "USD",
        name: "Quarterly",
        billingIncrement: "P1M",
      },
      {
        "@type": "Offer",
        price: "7",
        priceCurrency: "USD",
        name: "Annual",
        billingIncrement: "P1M",
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSite) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
    </>
  );
}
