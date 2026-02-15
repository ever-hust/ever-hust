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
    sameAs: [],
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
        urlTemplate: `${baseUrl}/dashboard/chat?q={search_term_string}`,
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
    </>
  );
}
