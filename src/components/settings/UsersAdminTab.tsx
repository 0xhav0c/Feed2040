"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingRow, SettingsCard, StatusBadge } from "@/components/settings/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield,
  ShieldOff,
  Trash2,
  KeyRound,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface AdminUser {
  id: string;
  username: string;
  name: string | null;
  role: string;
  createdAt: string;
  feedCount: number;
}

export function UsersAdminTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [changingRole, setChangingRole] = useState(false);

  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const d = await res.json();
        setUsers(d.data || []);
      }
    } catch {
      toast.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const d = await res.json();
        setRegistrationEnabled(d.data?.registrationEnabled ?? true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchSettings();
  }, [fetchUsers, fetchSettings]);

  async function handleRegistrationToggle(enabled: boolean) {
    setToggling(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationEnabled: enabled }),
      });
      if (res.ok) {
        setRegistrationEnabled(enabled);
        toast.success(enabled ? "Registration enabled" : "Registration disabled");
      } else {
        toast.error("Failed to update setting");
      }
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`User "${deleteTarget.username}" deleted`);
        setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleRoleChange() {
    if (!roleTarget) return;
    setChangingRole(true);
    const newRole = roleTarget.role === "admin" ? "user" : "admin";
    try {
      const res = await fetch(`/api/admin/users/${roleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        toast.success(`${roleTarget.username} is now ${newRole}`);
        setUsers((prev) =>
          prev.map((u) => (u.id === roleTarget.id ? { ...u, role: newRole } : u))
        );
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to change role");
      }
    } catch {
      toast.error("Failed to change role");
    } finally {
      setChangingRole(false);
      setRoleTarget(null);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget || !newPassword.trim()) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        toast.success(`Password reset for "${resetTarget.username}"`);
        setResetTarget(null);
        setNewPassword("");
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to reset password");
      }
    } catch {
      toast.error("Failed to reset password");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsCard title="Sign-ups" description="Saved as soon as you change it.">
        <SettingRow
          label="Allow new accounts"
          description="When on, anyone who can reach this server can register from the login page."
          htmlFor="admin-registration"
        >
          <Switch
            id="admin-registration"
            checked={registrationEnabled}
            onCheckedChange={(v: boolean) => handleRegistrationToggle(v)}
            disabled={toggling}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title="Accounts"
        description={`${users.length} user${users.length !== 1 ? "s" : ""} on this server.`}
      >
      <div className="py-4">

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(user.name || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {user.name || user.username}
                      </p>
                      <StatusBadge tone={user.role === "admin" ? "info" : "neutral"}>
                        {user.role === "admin" ? "Admin" : "User"}
                      </StatusBadge>
                      {user.id === currentUserId && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      @{user.username} &middot; {user.feedCount} feeds &middot;{" "}
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {user.id !== currentUserId && (
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setRoleTarget(user)}>
                      {user.role === "admin" ? <ShieldOff aria-hidden /> : <Shield aria-hidden />}
                      {user.role === "admin" ? "Make user" : "Make admin"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setResetTarget(user);
                        setNewPassword("");
                      }}
                    >
                      <KeyRound aria-hidden /> Reset password
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(user)}
                      aria-label={`Delete ${user.username}`}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 aria-hidden /> Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      </SettingsCard>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete User"
        description={`Are you sure you want to delete "${deleteTarget?.username}"? All their feeds, articles, bookmarks, and settings will be permanently deleted.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Role Change Confirmation */}
      <ConfirmDialog
        open={!!roleTarget}
        title={roleTarget?.role === "admin" ? "Demote User" : "Promote User"}
        description={
          roleTarget?.role === "admin"
            ? `Remove admin privileges from "${roleTarget?.username}"?`
            : `Grant admin privileges to "${roleTarget?.username}"? They will be able to manage all users and settings.`
        }
        confirmLabel={roleTarget?.role === "admin" ? "Demote" : "Promote"}
        variant={roleTarget?.role === "admin" ? "danger" : "default"}
        loading={changingRole}
        onConfirm={handleRoleChange}
        onCancel={() => setRoleTarget(null)}
      />

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password for @{resetTarget?.username}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="New password (min 6 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetTarget(null);
                setNewPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetting || newPassword.length < 6}
            >
              {resetting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <KeyRound size={14} />
              )}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
