import { APP_NAME } from "@ever-hust/utils";

export function AboutStructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hust.so";

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Ever Co. LTD",
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    description:
      `Ever Co. LTD builds ${APP_NAME}, an AI-powered job search platform that helps users find, apply, and land their dream job through natural conversation.`,
    foundingDate: "2024",
    sameAs: [
      "https://ever.co",
      "https://github.com/ever-co",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: `${baseUrl}/contact`,
      },
      {
        "@type": "ContactPoint",
        contactType: "hiring",
        email: "careers@hust.so",
      },
    ],
    brand: {
      "@type": "Brand",
      name: APP_NAME,
      url: baseUrl,
    },
  };

  // Escape closing script tags in JSON-LD to prevent XSS via crafted data
  // containing "</script>".
  const safeStringify = (data: object) =>
    JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeStringify(organization) }}
    />
  );
}
