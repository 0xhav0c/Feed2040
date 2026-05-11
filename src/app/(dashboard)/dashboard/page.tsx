"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Rss,
  FileText,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  BookOpen,
} from "lucide-react";

type StatsData = {
  overview: {
    totalFeeds: number;
    totalArticles: number;
    totalBookmarks: number;
    totalCategories: number;
    readCount: number;
    unreadCount: number;
    readToday: number;
    readThisWeek: number;
    articlesToday: number;
    articlesThisWeek: number;
  };
  topFeedsThisWeek: { title: string; count: number }[];
  feedHealthSummary: { healthy: number; errors: number };
};

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card className="rounded-2xl border border-border bg-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
            <Icon size={20} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Dashboard | Feed2040";
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        if (res.ok && data.data) {
          setStats(data.data);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <>
      <Header title="Dashboard" subtitle="Overview of your feeds and reading activity" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Empty state: no feeds */}
          {!loading && stats && stats.overview.totalFeeds === 0 ? (
            <Card className="rounded-2xl border border-border bg-card">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <Rss size={48} className="text-muted-foreground" />
                <h2 className="text-lg font-semibold">Welcome to Feed2040</h2>
                <p className="text-sm text-muted-foreground">Add your first feed to get started</p>
                <Button onClick={() => router.push("/feeds/add")}>Add Your First Feed</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Row 1: Key Stats */}
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="rounded-2xl h-[104px]" />
                  ))}
                </div>
              ) : stats ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    icon={Rss}
                    label="Total Feeds"
                    value={stats.overview.totalFeeds}
                    color="bg-blue-500/10 text-blue-500"
                  />
                  <StatCard
                    icon={FileText}
                    label="Total Articles"
                    value={stats.overview.totalArticles}
                    color="bg-purple-500/10 text-purple-500"
                  />
                  <StatCard
                    icon={Eye}
                    label="Unread Articles"
                    value={stats.overview.unreadCount}
                    color="bg-amber-500/10 text-amber-500"
                  />
                  <StatCard
                    icon={Clock}
                    label="Articles Today"
                    value={stats.overview.articlesToday}
                    color="bg-green-500/10 text-green-500"
                  />
                </div>
              ) : null}

              {/* Row 2: Most Active Feeds + Reading Activity */}
              {loading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Skeleton className="rounded-2xl h-64" />
                  <Skeleton className="rounded-2xl h-64" />
                </div>
              ) : stats ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Most Active Feeds This Week */}
                  <Card className="rounded-2xl border border-border bg-card">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-3 mb-5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <TrendingUp size={20} className="text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">Most Active Feeds</h3>
                          <p className="text-sm text-muted-foreground">Top feeds by article count this week</p>
                        </div>
                      </div>
                      {stats.topFeedsThisWeek.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No articles this week yet</p>
                      ) : (
                        <div className="space-y-3">
                          {stats.topFeedsThisWeek.map((feed, i) => (
                            <div key={i} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xs font-bold text-muted-foreground w-5 text-right shrink-0">
                                  {i + 1}
                                </span>
                                <span className="text-sm truncate">{feed.title}</span>
                              </div>
                              <Badge variant="secondary" className="shrink-0 bg-primary/10 text-primary border-transparent">
                                {feed.count} {feed.count === 1 ? "article" : "articles"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Reading Activity */}
                  <Card className="rounded-2xl border border-border bg-card">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-3 mb-5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <BookOpen size={20} className="text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">Reading Activity</h3>
                          <p className="text-sm text-muted-foreground">Your reading progress</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-xl border border-border p-4">
                          <div>
                            <p className="text-sm font-medium">Read Today</p>
                            <p className="text-xs text-muted-foreground">Articles you read today</p>
                          </div>
                          <span className="text-2xl font-bold">{stats.overview.readToday}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-border p-4">
                          <div>
                            <p className="text-sm font-medium">Read This Week</p>
                            <p className="text-xs text-muted-foreground">Articles you read this week</p>
                          </div>
                          <span className="text-2xl font-bold">{stats.overview.readThisWeek}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-border p-4">
                          <div>
                            <p className="text-sm font-medium">New This Week</p>
                            <p className="text-xs text-muted-foreground">Articles published this week</p>
                          </div>
                          <span className="text-2xl font-bold">{stats.overview.articlesThisWeek}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : null}

              {/* Row 3: Feed Health Summary */}
              {loading ? (
                <Skeleton className="rounded-2xl h-32" />
              ) : stats ? (
                <Card className="rounded-2xl border border-border bg-card">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3 mb-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <AlertTriangle size={20} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Feed Health</h3>
                        <p className="text-sm text-muted-foreground">Status of your feed subscriptions</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                        <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                        <div>
                          <p className="text-2xl font-bold">{stats.feedHealthSummary.healthy}</p>
                          <p className="text-sm text-muted-foreground">Healthy Feeds</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                        <AlertTriangle size={20} className="text-red-500 shrink-0" />
                        <div>
                          <p className="text-2xl font-bold">{stats.feedHealthSummary.errors}</p>
                          <p className="text-sm text-muted-foreground">Feeds with Errors</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
