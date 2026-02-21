import { nextJsConfig } from "@ever-hust/eslint-config/next-js";

export default [
  ...nextJsConfig,
  {
    rules: {
      // Company logos and external images use <img> with onError fallback;
      // next/image requires explicit width/height which breaks dynamic logos.
      "@next/next/no-img-element": "off",
      // The 404 page intentionally uses <a> for full reload navigation.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];
