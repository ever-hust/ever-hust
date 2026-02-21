import Link from "next/link";
import { BriefcaseBusiness, Github, Twitter } from "lucide-react";
import { Separator } from "@ever-hust/ui/separator";
import { APP_NAME } from "@ever-hust/utils";

const PRODUCT_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/login", label: "Sign In" },
];

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

const SOCIAL_LINKS = [
  {
    href: "https://github.com/ever-co",
    label: "GitHub",
    icon: Github,
  },
  {
    href: "https://twitter.com/evaborjobs",
    label: "Twitter",
    icon: Twitter,
  },
];

export function Footer() {
  return (
    <footer className="border-t px-4 py-12 sm:px-6 lg:px-8" role="contentinfo">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2" aria-label={`${APP_NAME} home`}>
              <BriefcaseBusiness className="h-6 w-6 text-primary" aria-hidden="true" />
              <span className="text-lg font-bold">{APP_NAME}</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              AI-powered job search assistant. Find, apply, and land your dream
              job through natural conversation.
            </p>
            {/* Social links */}
            <div className="mt-4 flex items-center gap-3">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={`${social.label} (opens in new tab)`}
                >
                  <social.icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Product</h3>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Company</h3>
            <ul className="space-y-2">
              {COMPANY_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Legal</h3>
            <ul className="space-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Ever Co. LTD. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Built with &hearts; using Next.js, AI SDK, and Claude
          </p>
        </div>
      </div>
    </footer>
  );
}
