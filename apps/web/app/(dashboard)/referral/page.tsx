"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { Gift } from "lucide-react";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { PageHeader } from "@/components/shared/page-header";

const ReferralProgramCard = dynamic(
  () =>
    import("@/components/settings/referral-program-card").then(
      (mod) => mod.ReferralProgramCard,
    ),
  {
    loading: () => <Skeleton className="h-40 w-full rounded-lg" />,
    ssr: false,
  },
);

export default function ReferralPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader icon={Gift} title="Referral Program" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ReferralProgramCard />
        <ScrollToTop containerRef={scrollRef} />
      </div>
    </div>
  );
}
