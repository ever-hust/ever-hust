import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Details",
};

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Job #{id}</h1>
        <p className="mt-2 text-muted-foreground">
          Job detail view coming in Phase 2.
        </p>
      </div>
    </div>
  );
}
