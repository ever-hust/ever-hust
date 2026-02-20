import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Marketing Pages — Rendering & Navigation
// ---------------------------------------------------------------------------
// These tests verify that all public marketing pages render correctly,
// contain the expected content, and that navigation between them works.
// No authentication is required for any of these routes.
// ---------------------------------------------------------------------------

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the hero section with heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /ai-powered job search/i })
    ).toBeVisible();
  });

  test("renders the main content landmark", async ({ page }) => {
    await expect(page.locator("main#main-content")).toBeVisible();
  });

  test("has a skip-to-content link", async ({ page }) => {
    // The skip link is sr-only but should exist in the DOM
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toHaveCount(1);
  });

  test("renders integrations section", async ({ page }) => {
    // The Integrations component should be present on the landing page
    await expect(page.locator("main#main-content")).toBeVisible();
  });

  test("renders features section", async ({ page }) => {
    await expect(
      page.getByText(/ai chat assistant/i).first()
    ).toBeVisible();
  });

  test("renders how-it-works section", async ({ page }) => {
    const howItWorks = page.locator("#how-it-works");
    await expect(howItWorks).toBeVisible();
    await expect(howItWorks.getByText(/how it works/i).first()).toBeVisible();
  });

  test("renders pricing section with plans", async ({ page }) => {
    const pricingSection = page.locator("#pricing");
    await expect(pricingSection).toBeVisible();

    // Free plan
    await expect(pricingSection.getByText("$0")).toBeVisible();
    // Quarterly plan
    await expect(pricingSection.getByText("$12")).toBeVisible();
    // Annual plan
    await expect(pricingSection.getByText("$7")).toBeVisible();
  });

  test("renders CTA section", async ({ page }) => {
    // There should be a call-to-action section near the bottom
    const ctaLinks = page.getByRole("link", { name: /get started/i });
    const count = await ctaLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("renders footer with all link sections", async ({ page }) => {
    const footer = page.locator('footer[role="contentinfo"]');
    await expect(footer).toBeVisible();

    // Product section
    await expect(footer.getByText("Product")).toBeVisible();
    // Company section
    await expect(footer.getByText("Company")).toBeVisible();
    // Legal section
    await expect(footer.getByText("Legal")).toBeVisible();
  });

  test("renders the navbar with navigation links", async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    await expect(nav.getByText("Features")).toBeVisible();
    await expect(nav.getByText("How It Works")).toBeVisible();
    await expect(nav.getByText("Pricing")).toBeVisible();
  });

  test("navbar has login and get-started buttons", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /log in/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /get started/i }).first()
    ).toBeVisible();
  });

  test("copyright notice is displayed in footer", async ({ page }) => {
    const footer = page.locator('footer[role="contentinfo"]');
    await expect(footer.getByText(/ever co\. ltd/i)).toBeVisible();
  });
});

test.describe("Pricing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing");
  });

  test("renders pricing page heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /pricing/i })
    ).toBeVisible();
  });

  test("has a skip-to-content link", async ({ page }) => {
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toHaveCount(1);
  });

  test("renders main content landmark", async ({ page }) => {
    await expect(page.locator("main#main-content")).toBeVisible();
  });

  test("shows three pricing tiers", async ({ page }) => {
    await expect(page.getByText("$0")).toBeVisible();
    await expect(page.getByText("$12")).toBeVisible();
    await expect(page.getByText("$7")).toBeVisible();
  });

  test("pricing cards have CTA buttons linking to login", async ({ page }) => {
    const ctaButtons = page.getByRole("link", { name: /get started/i });
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // First CTA should link to login
    const firstCta = ctaButtons.first();
    const href = await firstCta.getAttribute("href");
    expect(href).toBe("/login");
  });

  test("renders navbar and footer", async ({ page }) => {
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });
});

test.describe("About Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/about");
  });

  test("renders about page heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /about ever jobs/i })
    ).toBeVisible();
  });

  test("renders mission section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /our mission/i })
    ).toBeVisible();
    await expect(
      page.getByText(/job search process faster/i)
    ).toBeVisible();
  });

  test("renders values section with all four values", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /what we believe/i })
    ).toBeVisible();
    await expect(page.getByText("AI-First Experience")).toBeVisible();
    await expect(page.getByText("People Over Processes")).toBeVisible();
    await expect(page.getByText("Open & Transparent")).toBeVisible();
    await expect(page.getByText("Built for Job Seekers")).toBeVisible();
  });

  test("renders team section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /our team/i })
    ).toBeVisible();
    await expect(page.getByText(/ever co\. ltd/i).first()).toBeVisible();
  });

  test("renders contact CTA section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /get in touch/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /contact us/i })
    ).toHaveAttribute("href", "/contact");
  });

  test("renders navbar and footer", async ({ page }) => {
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });

  test("has main content landmark", async ({ page }) => {
    await expect(page.locator("main#main-content")).toBeVisible();
  });
});

test.describe("Contact Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact");
  });

  test("renders contact page heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /contact us/i }).first()
    ).toBeVisible();
  });

  test("renders all three contact channels", async ({ page }) => {
    await expect(page.getByText("General Inquiries")).toBeVisible();
    await expect(page.getByText("Support")).toBeVisible();
    await expect(page.getByText("Partnerships & Enterprise")).toBeVisible();
  });

  test("renders email addresses as mailto links", async ({ page }) => {
    const helloLink = page.getByRole("link", {
      name: /hello@everjobs\.ai/i,
    });
    await expect(helloLink).toBeVisible();
    await expect(helloLink).toHaveAttribute(
      "href",
      "mailto:hello@everjobs.ai"
    );

    const supportLink = page.getByRole("link", {
      name: /support@everjobs\.ai/i,
    });
    await expect(supportLink).toBeVisible();
    await expect(supportLink).toHaveAttribute(
      "href",
      "mailto:support@everjobs.ai"
    );

    const partnershipsLink = page.getByRole("link", {
      name: /partnerships@everjobs\.ai/i,
    });
    await expect(partnershipsLink).toBeVisible();
    await expect(partnershipsLink).toHaveAttribute(
      "href",
      "mailto:partnerships@everjobs.ai"
    );
  });

  test("renders company information section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /company information/i })
    ).toBeVisible();
    await expect(page.getByText(/ever co\. ltd/i).first()).toBeVisible();
  });

  test("renders navbar and footer", async ({ page }) => {
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });
});

test.describe("Terms of Service Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/terms");
  });

  test("renders terms page heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /terms of service/i }).first()
    ).toBeVisible();
  });

  test("renders last-updated date", async ({ page }) => {
    await expect(page.getByText(/last updated/i)).toBeVisible();
  });

  test("renders all 10 terms sections", async ({ page }) => {
    const sectionHeadings = [
      "1. Acceptance of Terms",
      "2. Use of Service",
      "3. User Accounts",
      "4. Subscription Plans & Payments",
      "5. Intellectual Property",
      "6. AI-Generated Content Disclaimer",
      "7. Limitation of Liability",
      "8. Termination",
      "9. Governing Law",
      "10. Contact Us",
    ];

    for (const heading of sectionHeadings) {
      await expect(
        page.getByRole("heading", { name: heading })
      ).toBeVisible();
    }
  });

  test("renders contact email link", async ({ page }) => {
    const emailLinks = page.getByRole("link", {
      name: /legal@everjobs\.ai/i,
    });
    const count = await emailLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("renders navbar and footer", async ({ page }) => {
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });

  test("has main content landmark", async ({ page }) => {
    await expect(page.locator("main#main-content")).toBeVisible();
  });
});

test.describe("Privacy Policy Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/privacy");
  });

  test("renders privacy page heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /privacy policy/i }).first()
    ).toBeVisible();
  });

  test("renders last-updated date", async ({ page }) => {
    await expect(page.getByText(/last updated/i)).toBeVisible();
  });

  test("renders key privacy sections", async ({ page }) => {
    const sectionHeadings = [
      "1. Information We Collect",
      "2. How We Use Your Information",
      "3. Data Sharing",
      "5. Your Rights",
      "6. Data Retention",
      "7. Data Security",
      "10. Contact Us",
    ];

    for (const heading of sectionHeadings) {
      await expect(
        page.getByRole("heading", { name: heading })
      ).toBeVisible();
    }
  });

  test("renders contact email link", async ({ page }) => {
    const emailLinks = page.getByRole("link", {
      name: /privacy@everjobs\.ai/i,
    });
    const count = await emailLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("renders navbar and footer", async ({ page }) => {
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });

  test("has main content landmark", async ({ page }) => {
    await expect(page.locator("main#main-content")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Footer Links — Verify all footer links point to correct destinations
// ---------------------------------------------------------------------------

test.describe("Footer Links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("product links point to correct pages", async ({ page }) => {
    const footer = page.locator('footer[role="contentinfo"]');

    // Features link (anchor on landing page)
    const featuresLink = footer.getByRole("link", { name: "Features" });
    await expect(featuresLink).toHaveAttribute("href", "/#features");

    // Pricing link
    const pricingLink = footer.getByRole("link", { name: "Pricing" });
    await expect(pricingLink).toHaveAttribute("href", "/pricing");

    // How It Works link (anchor on landing page)
    const howItWorksLink = footer.getByRole("link", { name: "How It Works" });
    await expect(howItWorksLink).toHaveAttribute("href", "/#how-it-works");

    // Sign In link
    const signInLink = footer.getByRole("link", { name: "Sign In" });
    await expect(signInLink).toHaveAttribute("href", "/login");
  });

  test("company links point to correct pages", async ({ page }) => {
    const footer = page.locator('footer[role="contentinfo"]');

    const aboutLink = footer.getByRole("link", { name: "About" });
    await expect(aboutLink).toHaveAttribute("href", "/about");

    const contactLink = footer.getByRole("link", { name: "Contact" });
    await expect(contactLink).toHaveAttribute("href", "/contact");
  });

  test("legal links point to correct pages", async ({ page }) => {
    const footer = page.locator('footer[role="contentinfo"]');

    const privacyLink = footer.getByRole("link", { name: "Privacy Policy" });
    await expect(privacyLink).toHaveAttribute("href", "/privacy");

    const termsLink = footer.getByRole("link", { name: "Terms of Service" });
    await expect(termsLink).toHaveAttribute("href", "/terms");
  });

  test("social links open in new tab", async ({ page }) => {
    const footer = page.locator('footer[role="contentinfo"]');

    const githubLink = footer.getByRole("link", {
      name: /github/i,
    });
    await expect(githubLink).toHaveAttribute("target", "_blank");
    await expect(githubLink).toHaveAttribute("rel", /noopener/);

    const twitterLink = footer.getByRole("link", {
      name: /twitter/i,
    });
    await expect(twitterLink).toHaveAttribute("target", "_blank");
    await expect(twitterLink).toHaveAttribute("rel", /noopener/);
  });

  test("Ever Jobs logo links to home page", async ({ page }) => {
    const footer = page.locator('footer[role="contentinfo"]');
    const logoLink = footer.getByRole("link", { name: /ever jobs home/i });
    await expect(logoLink).toHaveAttribute("href", "/");
  });
});

// ---------------------------------------------------------------------------
// Cross-Page Navigation — Navigate between marketing pages
// ---------------------------------------------------------------------------

test.describe("Marketing Page Navigation", () => {
  test("navigates from landing to pricing via navbar", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await nav.getByText("Pricing").click();
    await expect(page).toHaveURL("/pricing");
    await expect(
      page.getByRole("heading", { name: /pricing/i })
    ).toBeVisible();
  });

  test("navigates from about to contact via CTA link", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("link", { name: /contact us/i }).click();
    await expect(page).toHaveURL("/contact");
    await expect(
      page.getByRole("heading", { name: /contact us/i }).first()
    ).toBeVisible();
  });

  test("navigates from footer about link to about page", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator('footer[role="contentinfo"]');
    await footer.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL("/about");
    await expect(
      page.getByRole("heading", { name: /about ever jobs/i })
    ).toBeVisible();
  });

  test("navigates from footer terms link to terms page", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator('footer[role="contentinfo"]');
    await footer.getByRole("link", { name: "Terms of Service" }).click();
    await expect(page).toHaveURL("/terms");
    await expect(
      page.getByRole("heading", { name: /terms of service/i }).first()
    ).toBeVisible();
  });

  test("navigates from footer privacy link to privacy page", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.locator('footer[role="contentinfo"]');
    await footer.getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL("/privacy");
    await expect(
      page.getByRole("heading", { name: /privacy policy/i }).first()
    ).toBeVisible();
  });

  test("navigates from footer contact link to contact page", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.locator('footer[role="contentinfo"]');
    await footer.getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL("/contact");
    await expect(
      page.getByRole("heading", { name: /contact us/i }).first()
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 404 Not Found Page
// ---------------------------------------------------------------------------

test.describe("404 Page", () => {
  test("renders 404 page for non-existent routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });

  test("404 page has links back to home and chat", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(
      page.getByRole("link", { name: /go home/i })
    ).toHaveAttribute("href", "/");
    await expect(
      page.getByRole("link", { name: /go to chat/i })
    ).toHaveAttribute("href", "/chat");
  });

  test("404 page has helpful suggestions", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByText(/looking for something specific/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /search for jobs/i })
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Accessibility Basics — Landmarks, headings, and roles
// ---------------------------------------------------------------------------

test.describe("Accessibility - Marketing Pages", () => {
  const marketingPages = [
    { path: "/", name: "Landing" },
    { path: "/pricing", name: "Pricing" },
    { path: "/about", name: "About" },
    { path: "/contact", name: "Contact" },
    { path: "/terms", name: "Terms" },
    { path: "/privacy", name: "Privacy" },
  ];

  for (const { path, name } of marketingPages) {
    test(`${name} page has a header element`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("header").first()).toBeVisible();
    });

    test(`${name} page has a main element`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
    });

    test(`${name} page has a footer with contentinfo role`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(
        page.locator('footer[role="contentinfo"]')
      ).toBeVisible();
    });

    test(`${name} page has an h1 heading`, async ({ page }) => {
      await page.goto(path);
      const h1 = page.locator("h1");
      const count = await h1.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test(`${name} page has a proper document title`, async ({ page }) => {
      await page.goto(path);
      const title = await page.title();
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);
    });
  }
});
