"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Users,
  Briefcase,
  CreditCard,
  TrendingUp,
  MessageSquare,
  Globe,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────

interface OverviewData {
  totalUsers: number;
  newUsersLast7d: number;
  newUsersLast30d: number;
  totalJobs: number;
  activeSubscriptions: number;
  totalApplications: number;
  totalChatSessions: number;
  totalReferrals: number;
}

interface UserGrowthPoint {
  date: string;
  count: number;
}

interface JobStats {
  topLocations: Array<{ location: string; count: number }>;
  remoteBreakdown: Array<{ type: string; count: number }>;
  topCompanies: Array<{ company: string; count: number }>;
  jobLevelDistribution: Array<{ level: string; count: number }>;
  salaryRanges: Array<{ range: string; count: number }>;
}

interface AiUsageData {
  totalChatSessions: number;
  totalMessages: number;
  dailyMessageCounts: Array<{ date: string; count: number }>;
  chatSessionStatusBreakdown: Array<{ status: string; count: number }>;
}

interface SubscriptionData {
  byPlanType: Array<{ planType: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  recentChanges: Array<{
    id: number;
    userId: string;
    planType: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

// ── Chart colors ─────────────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
  "hsl(var(--muted-foreground))",
];

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Stat Card ────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-3xl font-bold">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [userGrowth, setUserGrowth] = useState<UserGrowthPoint[]>([]);
  const [jobStats, setJobStats] = useState<JobStats | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageData | null>(null);
  const [subscriptionData, setSubscriptionData] =
    useState<SubscriptionData | null>(null);

  useEffect(() => {
    async function fetchAll() {
      const [overviewRes, growthRes, jobsRes, aiRes, subsRes] =
        await Promise.all([
          apiFetch<OverviewData>("/api/admin/analytics/overview"),
          apiFetch<UserGrowthPoint[]>("/api/admin/analytics/user-growth?days=30"),
          apiFetch<JobStats>("/api/admin/analytics/job-stats"),
          apiFetch<AiUsageData>("/api/admin/analytics/ai-usage?days=30"),
          apiFetch<SubscriptionData>("/api/admin/analytics/subscriptions"),
        ]);

      if (overviewRes) setOverview(overviewRes);
      if (growthRes) setUserGrowth(growthRes);
      if (jobsRes) setJobStats(jobsRes);
      if (aiRes) setAiUsage(aiRes);
      if (subsRes) setSubscriptionData(subsRes);
      setLoading(false);
    }
    fetchAll();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="h-6 w-6" aria-hidden="true" />
          Analytics
        </h1>
        <p className="text-muted-foreground">
          Platform usage metrics and business intelligence.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={overview?.totalUsers ?? 0}
          icon={Users}
          loading={loading}
        />
        <StatCard
          title="New Users (7d)"
          value={overview?.newUsersLast7d ?? 0}
          icon={TrendingUp}
          loading={loading}
        />
        <StatCard
          title="Active Subscriptions"
          value={overview?.activeSubscriptions ?? 0}
          icon={CreditCard}
          loading={loading}
        />
        <StatCard
          title="Total Jobs"
          value={overview?.totalJobs ?? 0}
          icon={Briefcase}
          loading={loading}
        />
      </div>

      {/* Two-column: User Growth + Subscription Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Growth Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
              User Growth (Last 30 Days)
            </CardTitle>
            <CardDescription>Daily new user signups</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : userGrowth.length === 0 ? (
              <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No signup data available for this period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={userGrowth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    labelFormatter={formatDate}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="New Users"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Subscription Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
              Subscription Distribution
            </CardTitle>
            <CardDescription>Breakdown by plan type</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : !subscriptionData ||
              subscriptionData.byPlanType.length === 0 ? (
              <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No subscription data available.
              </p>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={subscriptionData.byPlanType}
                      dataKey="count"
                      nameKey="planType"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ planType, count }) =>
                        `${String(planType)} (${String(count)})`
                      }
                    >
                      {subscriptionData.byPlanType.map((_, index) => (
                        <Cell
                          key={`cell-${String(index)}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-4 pt-2">
                  {subscriptionData.byPlanType.map((item, index) => (
                    <div
                      key={item.planType}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor:
                            CHART_COLORS[index % CHART_COLORS.length],
                        }}
                      />
                      <span className="capitalize">{item.planType}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Job Market Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" aria-hidden="true" />
            Job Market Insights
          </CardTitle>
          <CardDescription>
            Remote vs on-site breakdown and top locations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[350px] w-full" />
          ) : !jobStats ? (
            <p className="flex h-[350px] items-center justify-center text-sm text-muted-foreground">
              No job data available.
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Remote Breakdown */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  Remote vs On-site
                </h3>
                {jobStats.remoteBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={jobStats.remoteBreakdown}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="type"
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--popover-foreground))",
                        }}
                      />
                      <Bar dataKey="count" name="Jobs" radius={[4, 4, 0, 0]}>
                        {jobStats.remoteBreakdown.map((_, index) => (
                          <Cell
                            key={`remote-${String(index)}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Top Locations */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  Top Locations
                </h3>
                {jobStats.topLocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={jobStats.topLocations}
                      layout="vertical"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        type="category"
                        dataKey="location"
                        tick={{ fontSize: 11 }}
                        width={100}
                        className="text-muted-foreground"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--popover-foreground))",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Jobs"
                        fill="hsl(var(--primary))"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
            AI Usage (Last 30 Days)
          </CardTitle>
          <CardDescription>
            Chat sessions, messages, and daily activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[350px] w-full" />
          ) : !aiUsage ? (
            <p className="flex h-[350px] items-center justify-center text-sm text-muted-foreground">
              No AI usage data available.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Session Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">
                    Chat Sessions
                  </p>
                  <p className="text-2xl font-bold">
                    {aiUsage.totalChatSessions.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">
                    Total Messages
                  </p>
                  <p className="text-2xl font-bold">
                    {aiUsage.totalMessages.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">
                    Avg Messages / Session
                  </p>
                  <p className="text-2xl font-bold">
                    {aiUsage.totalChatSessions > 0
                      ? (
                          aiUsage.totalMessages / aiUsage.totalChatSessions
                        ).toFixed(1)
                      : "0"}
                  </p>
                </div>
              </div>

              {/* Daily Messages Line Chart */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  Daily Messages
                </h3>
                {aiUsage.dailyMessageCounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No message data for this period.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={aiUsage.dailyMessageCounts}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip
                        labelFormatter={formatDate}
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--popover-foreground))",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={2}
                        dot={false}
                        name="Messages"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Session Status Breakdown */}
              {aiUsage.chatSessionStatusBreakdown.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                    Session Status Breakdown
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {aiUsage.chatSessionStatusBreakdown.map((item) => (
                      <div
                        key={item.status}
                        className="rounded-lg border px-4 py-2"
                      >
                        <span className="text-sm capitalize text-muted-foreground">
                          {item.status}
                        </span>
                        <p className="text-lg font-semibold">
                          {item.count.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Applications"
          value={overview?.totalApplications ?? 0}
          icon={Activity}
          loading={loading}
        />
        <StatCard
          title="New Users (30d)"
          value={overview?.newUsersLast30d ?? 0}
          icon={Users}
          loading={loading}
        />
        <StatCard
          title="Chat Sessions"
          value={overview?.totalChatSessions ?? 0}
          icon={MessageSquare}
          loading={loading}
        />
        <StatCard
          title="Total Referrals"
          value={overview?.totalReferrals ?? 0}
          icon={Globe}
          loading={loading}
        />
      </div>
    </div>
  );
}
