"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { FormError, SettingsCard } from "@/components/ui/settings-card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsProfile } from "../context/settings-profile-context";

export function DeleteAccountCard() {
  const { profile } = useSettingsProfile();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const needsPassword = (profile?.provider ?? "credentials") === "credentials";
  const ready = needsPassword ? password.length > 0 : confirmText.trim().toLowerCase() === "delete";

  function close() {
    if (deleting) return;
    setOpen(false);
    setPassword("");
    setConfirmText("");
    setError(null);
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsPassword ? { password } : {}),
      });
      if (res.ok) {
        window.location.href = "/sign-in";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not delete your account.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SettingsCard
        tone="danger"
        title="Delete account"
        description="Permanently removes your account and your store project, and cancels your subscription. This can't be undone."
        action={
          <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete account
          </Button>
        }
      />
      <Modal
        isOpen={open}
        onClose={close}
        size="sm"
        title="Delete your account?"
        description="Everything tied to this account is removed right away."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={close} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={deleting} disabled={!ready} onClick={() => void handleDelete()}>
              Delete account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {needsPassword ? (
            <Input
              type="password"
              label="Enter your password to confirm"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          ) : (
            <Input
              label='Type "delete" to confirm'
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoFocus
            />
          )}
          {error && <FormError>{error}</FormError>}
        </div>
      </Modal>
    </>
  );
}
