"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { Code2 } from "lucide-react";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { PageHeader } from "@/components/shared/page-header";

const DeveloperApiCard = dynamic(
  () =>
    import("@/components/settings/developer-api-card").then(
      (mod) => mod.DeveloperApiCard,
    ),
  {
    loading: () => <Skeleton className="h-40 w-full rounded-lg" />,
    ssr: false,
  },
);

export default function DeveloperPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader icon={Code2} title="Developer API" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <DeveloperApiCard />
        <ScrollToTop containerRef={scrollRef} />
      </div>
    </div>
  );
}
