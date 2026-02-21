export function PricingStructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://everjobs.ai";

  const product = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Ever Jobs Pro",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${baseUrl}/pricing`,
    description:
      "AI-powered job search platform with unlimited conversations, job searches, cover letters, interview prep, and application tracking.",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        description: "Try Ever Jobs with basic features",
        url: `${baseUrl}/pricing`,
      },
      {
        "@type": "Offer",
        name: "Quarterly",
        price: "36.00",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "36.00",
          priceCurrency: "USD",
          unitCode: "MON",
          referenceQuantity: {
            "@type": "QuantitativeValue",
            value: "3",
            unitCode: "MON",
          },
        },
        description: "Billed $36 every 3 months ($12/mo)",
        url: `${baseUrl}/pricing`,
      },
      {
        "@type": "Offer",
        name: "Annual",
        price: "84.00",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "84.00",
          priceCurrency: "USD",
          unitCode: "ANN",
          referenceQuantity: {
            "@type": "QuantitativeValue",
            value: "1",
            unitCode: "ANN",
          },
        },
        description: "Billed $84 per year ($7/mo)",
        url: `${baseUrl}/pricing`,
      },
    ],
  };

  // Escape closing script tags in JSON-LD to prevent XSS via crafted data
  // containing "</script>".
  const safeStringify = (data: object) =>
    JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeStringify(product) }}
    />
  );
}
