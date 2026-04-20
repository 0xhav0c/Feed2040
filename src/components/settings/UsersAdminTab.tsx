"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SectionTitle } from "@/components/settings/SectionTitle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Users,
  Shield,
  ShieldOff,
  Trash2,
  KeyRound,
  Loader2,
  UserPlus,
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
    <div className="space-y-8">
      <SectionTitle
        icon={Users}
        title="User Management"
        description="Manage users, roles, and registration settings"
      />

      {/* Registration Toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <UserPlus size={18} className="text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Open Registration</p>
            <p className="text-xs text-muted-foreground">
              Allow new users to create accounts
            </p>
          </div>
        </div>
        <Switch
          checked={registrationEnabled}
          onCheckedChange={handleRegistrationToggle}
          disabled={toggling}
        />
      </div>

      <Separator />

      {/* Users List */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">
          {users.length} user{users.length !== 1 ? "s" : ""}
        </h4>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
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
                      <Badge
                        variant="secondary"
                        className={
                          user.role === "admin"
                            ? "bg-amber-500/10 text-amber-600 text-[10px] px-1.5"
                            : "text-[10px] px-1.5"
                        }
                      >
                        {user.role}
                      </Badge>
                      {user.id === currentUserId && (
                        <span className="text-[10px] text-muted-foreground">(you)</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      @{user.username} &middot; {user.feedCount} feeds &middot;{" "}
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {user.id !== currentUserId && (
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title={user.role === "admin" ? "Demote to user" : "Promote to admin"}
                      onClick={() => setRoleTarget(user)}
                    >
                      {user.role === "admin" ? (
                        <ShieldOff size={14} />
                      ) : (
                        <Shield size={14} />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="Reset password"
                      onClick={() => {
                        setResetTarget(user);
                        setNewPassword("");
                      }}
                    >
                      <KeyRound size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      title="Delete user"
                      onClick={() => setDeleteTarget(user)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
