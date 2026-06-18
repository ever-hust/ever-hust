import type { MetadataRoute } from "next";

// The public marketing pages now live on the website (hust.so), which has its own
// sitemap. app.hust.so is the application surface, so its sitemap only lists the
// public app entry points.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.hust.so";

  return [
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
