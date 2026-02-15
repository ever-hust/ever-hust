export function formatSalary(
  min?: string | number | null,
  max?: string | number | null,
  currency = "USD",
  interval = "yearly"
): string {
  if (!min && !max) return "";

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  const suffix = interval === "yearly" ? "/yr" : `/${interval}`;

  if (min && max) {
    return `${formatter.format(Number(min))} - ${formatter.format(Number(max))}${suffix}`;
  }
  if (min) return `${formatter.format(Number(min))}+${suffix}`;
  if (max) return `Up to ${formatter.format(Number(max))}${suffix}`;
  return "";
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}
