"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Rss,
  Lock,
  User,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Database,
  Shield,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SetupStep = "checking" | "form" | "creating" | "done" | "already-done";

export default function SetupPage() {
  const [step, setStep] = useState<SetupStep>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [dbError, setDbError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkSetup();
  }, []);

  async function checkSetup() {
    try {
      const res = await fetch("/api/setup");
      const data = await res.json();

      if (data.data?.dbError) {
        setDbError(true);
        // DB error - don't show form, keep checking
        setTimeout(checkSetup, 3000);
        return;
      }

      if (data.data?.needsSetup) {
        setDbError(false);
        setStep("form");
      } else {
        setStep("already-done");
      }
    } catch {
      setDbError(true);
      setTimeout(checkSetup, 3000);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("creating");

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Setup failed");
        setStep("form");
        return;
      }

      setStep("done");

      // Auto-login after 1.5s
      setTimeout(async () => {
        const result = await signIn("credentials", {
          username,
          password,
          redirect: false,
        });

        if (result?.error) {
          router.push("/login");
        } else {
          router.push("/feeds");
          router.refresh();
        }
      }, 1500);
    } catch {
      setError("Setup failed. Make sure the database is running.");
      setStep("form");
    }
  }

  // Already setup
  if (step === "already-done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <CheckCircle2 className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-2xl font-bold">Already Configured</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Feed2040 is already set up. You can sign in with your account.
          </p>
          <Button
            onClick={() => router.push("/login")}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-semibold"
          >
            Go to Sign In
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    );
  }

  // Checking status
  if (step === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Done
  if (step === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <CheckCircle2 className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-2xl font-bold">All Set!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your admin account is ready. Redirecting to your dashboard...
          </p>
          <div className="mt-6">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  // Setup form
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
      </div>
      <div className="relative w-full max-w-lg">
        {/* Hero */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-xl shadow-primary/25">
            <Rss className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Feed2040</h1>
          <p className="mt-2 text-muted-foreground">
            Let&apos;s set up your smart RSS reader in seconds
          </p>
        </div>

        {/* Features */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { icon: Zap, label: "RSS/Atom/JSON", color: "text-yellow-500" },
            { icon: Sparkles, label: "AI Summaries", color: "text-purple-500" },
            { icon: Shield, label: "Self-hosted", color: "text-green-500" },
          ].map((f) => (
            <Card
              key={f.label}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3"
            >
              <CardContent className="flex flex-col items-center gap-1.5 p-0">
                <f.icon size={18} className={f.color} />
                <span className="text-xs font-medium text-muted-foreground">
                  {f.label}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Database warning */}
        {dbError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700">
            <Database size={16} />
            <span>
              Database connection pending. Make sure PostgreSQL is running.
            </span>
          </div>
        )}

        {/* Form */}
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold">Create Admin Account</h2>
                <p className="text-xs text-muted-foreground">
                  This will be your administrator account
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Username
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    required
                    autoFocus
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_]+"
                    title="Only letters, numbers, and underscores"
                    className={cn(
                      "rounded-xl py-2.5 pl-10 pr-4 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    )}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    required
                    minLength={6}
                    className={cn(
                      "rounded-xl py-2.5 pl-10 pr-4 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    )}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={step === "creating"}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold shadow-lg shadow-primary/20"
              >
                {step === "creating" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Launch Feed2040
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          You can add more users later from the settings page
        </p>
      </div>
    </div>
  );
}
