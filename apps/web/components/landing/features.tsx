import {
  MessageSquare,
  Bell,
  FileText,
  Linkedin,
  Search,
  Bot,
} from "lucide-react";
import { Badge } from "@ever-hust/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ever-hust/ui/card";

const features = [
  {
    title: "AI Chat Interface",
    description:
      "Have a natural conversation with your AI job assistant. Ask questions, refine searches, and manage your job hunt — all through chat.",
    icon: MessageSquare,
  },
  {
    title: "Smart Job Alerts",
    description:
      "Set up personalized alerts through chat. Get notified about new matching jobs daily, twice daily, or weekly via email.",
    icon: Bell,
  },
  {
    title: "AI Cover Letters",
    description:
      "Generate personalized cover letters instantly using your profile and the job description. Edit, copy, or download as PDF.",
    icon: FileText,
  },
  {
    title: "LinkedIn Integration",
    description:
      "Log in with LinkedIn to auto-fill your profile. Skills, experience, and preferences are extracted automatically.",
    icon: Linkedin,
  },
  {
    title: "Multi-Source Search",
    description:
      "Search across 25+ job boards and ATS platforms simultaneously. LinkedIn, Indeed, Glassdoor, Greenhouse, and many more.",
    icon: Search,
  },
  {
    title: "Application Agent",
    description:
      "Let AI handle your job applications end-to-end. Review and approve each step before submission. Coming soon.",
    icon: Bot,
    badge: "Coming Soon",
  },
];

export function Features() {
  return (
    <section id="features" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to land your dream job
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Powered by AI, designed for job seekers who want results.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="border-border/50 transition-all duration-200 hover:border-primary/30 hover:shadow-md"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  {"badge" in feature && feature.badge && (
                    <Badge variant="secondary" className="text-[10px]">
                      {feature.badge}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
