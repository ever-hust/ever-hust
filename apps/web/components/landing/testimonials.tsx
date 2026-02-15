import { Card, CardContent } from "@repo/ui/card";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";

const testimonials = [
  {
    quote:
      "I used to spend hours on LinkedIn and Indeed every day. Now I just chat with Ever Jobs and it finds exactly what I'm looking for.",
    name: "Sarah M.",
    role: "Software Engineer",
    initials: "SM",
  },
  {
    quote:
      "The AI cover letters are incredible. Each one is tailored to the specific job and matches my experience perfectly.",
    name: "James T.",
    role: "Product Manager",
    initials: "JT",
  },
  {
    quote:
      "Job alerts that actually work. I get notified about relevant positions before they get flooded with applications.",
    name: "Alex K.",
    role: "Data Scientist",
    initials: "AK",
  },
];

export function Testimonials() {
  return (
    <section className="border-y bg-muted/30 px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Loved by job seekers
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            See what our users have to say about Ever Jobs.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {testimonials.map((item) => (
            <Card key={item.name} className="border-border/50">
              <CardContent className="pt-6">
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  &ldquo;{item.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="text-xs">
                      {item.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
