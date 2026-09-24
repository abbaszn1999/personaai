"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  Info,
  MessageSquareText,
  Monitor,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Sparkles,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { BRAND_COLOR_PRESETS } from "@/modules/settings/mocks/defaults";
import type { Workspace, WorkspaceBranding, WorkspaceTheme } from "@/modules/workspaces/types";
import { defaultBranding } from "@/modules/workspaces/constants";
import {
  BRANDING_LIMITS,
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_ROUNDED,
  RADIUS_SQUARE,
  normalizeQuickReplies,
} from "@/modules/workspaces/branding-schema";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { STUDIO_BACKDROPS } from "@/modules/wearable-agent/constants";
import { WEARABLE_QUICK_REPLIES } from "@/modules/wearable-agent/mocks/responses";
import { CatalogReadyGate } from "@/modules/store/components/catalog-ready-gate";
import { cn } from "@/lib/utils/cn";
import { FontPicker } from "./font-picker";
import { fontFamilyCssValue, loadGoogleFont } from "@/lib/fonts/google-fonts";
import { resolveBrandCssVars } from "@/lib/branding/resolve-brand-vars";
import { BrandingAgentPreview, type PreviewDevice, type PreviewScreen } from "./branding-agent-preview";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const SECTIONS = [
  { id: "identity", label: "Identity", icon: Sparkles },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "conversation", label: "Conversation", icon: MessageSquareText },
  { id: "setup", label: "Setup", icon: Code2 },
] as const;

type ReplyMode = "default" | "custom" | "off";

function replyModeOf(replies: string[] | null): ReplyMode {
  if (replies === null) return "default";
  return replies.length === 0 ? "off" : "custom";
}

function brandingKey(branding: WorkspaceBranding, embedEnabled: boolean): string {
  return JSON.stringify({ ...branding, quickReplies: normalizeQuickReplies(branding.quickReplies), embedEnabled });
}

/* ── Color math for the contrast badge ─────────────────────────────────── */

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast of the white label the widget draws on brand-colored buttons and bubbles. */
function whiteContrast(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/* ── Main component ────────────────────────────────────────────────────── */

interface Props { workspace: Workspace }

export function WsBrandingEditor({ workspace }: Props) {
  const updateWorkspaceInStore = useWorkspaceStore((s) => s.updateWorkspace);

  const [saved, setSaved] = React.useState({ branding: workspace.branding, embedEnabled: workspace.embedEnabled });
  const [form, setForm] = React.useState<WorkspaceBranding>(workspace.branding);
  const [embedEnabled, setEmbedEnabled] = React.useState(workspace.embedEnabled);
  const [embedToken, setEmbedToken] = React.useState(workspace.embedToken);
  const [hexInput, setHexInput] = React.useState(workspace.branding.primaryColor);
  const [replyMode, setReplyMode] = React.useState<ReplyMode>(replyModeOf(workspace.branding.quickReplies));
  const [replyDraft, setReplyDraft] = React.useState("");

  const [device, setDevice] = React.useState<PreviewDevice>("desktop");
  const [screen, setScreen] = React.useState<PreviewScreen>("chat");
  const [activeSection, setActiveSection] = React.useState<string>("identity");

  const [justSaved, setJustSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const dirty = brandingKey(form, embedEnabled) !== brandingKey(saved.branding, saved.embedEnabled);

  function update(patch: Partial<WorkspaceBranding>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function applyBranding(next: WorkspaceBranding) {
    setForm(next);
    setHexInput(next.primaryColor);
    setReplyMode(replyModeOf(next.quickReplies));
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    if (!/^image\/(png|jpeg|jpg|svg\+xml|webp)$/.test(file.type)) {
      setLogoError("Please upload a PNG, JPG, WEBP, or SVG image");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be under 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") update({ logoUrl: reader.result });
    };
    reader.onerror = () => setLogoError("Failed to read that file. Try again.");
    reader.readAsDataURL(file);
  }

  function setColor(color: string) {
    update({ primaryColor: color.toLowerCase() });
    setHexInput(color.toLowerCase());
  }

  function handleHex(value: string) {
    const next = value.startsWith("#") ? value : `#${value}`;
    setHexInput(next);
    if (HEX_COLOR.test(next)) update({ primaryColor: next.toLowerCase() });
  }

  function changeReplyMode(mode: ReplyMode) {
    setReplyMode(mode);
    if (mode === "default") update({ quickReplies: null });
    if (mode === "off") update({ quickReplies: [] });
    if (mode === "custom") {
      const current = form.quickReplies?.length
        ? form.quickReplies
        : WEARABLE_QUICK_REPLIES.slice(0, BRANDING_LIMITS.quickReplies).map((q) => q.label);
      update({ quickReplies: current });
    }
  }

  function addReply() {
    const next = normalizeQuickReplies([...(form.quickReplies ?? []), replyDraft]) ?? [];
    update({ quickReplies: next });
    setReplyDraft("");
  }

  function removeReply(index: number) {
    update({ quickReplies: (form.quickReplies ?? []).filter((_, i) => i !== index) });
  }

  function editReply(index: number, value: string) {
    const list = [...(form.quickReplies ?? [])];
    list[index] = value.slice(0, BRANDING_LIMITS.quickReply);
    update({ quickReplies: list });
  }

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const branding = { ...form, quickReplies: normalizeQuickReplies(form.quickReplies) ?? null };
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branding, embedEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || "Failed to save changes");
        return;
      }
      const next = data.workspace as Workspace;
      updateWorkspaceInStore({ branding: next.branding, embedEnabled: next.embedEnabled });
      setSaved({ branding: next.branding, embedEnabled: next.embedEnabled });
      applyBranding(next.branding);
      setEmbedEnabled(next.embedEnabled);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      setSaveError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }, [form, embedEnabled, workspace.id, updateWorkspaceInStore]);

  function handleDiscard() {
    applyBranding(saved.branding);
    setEmbedEnabled(saved.embedEnabled);
    setSaveError(null);
  }

  function handleResetDefaults() {
    if (!window.confirm("Reset every appearance and conversation setting to Persona's defaults? Your logo is kept. Nothing is saved until you choose Save.")) {
      return;
    }
    applyBranding({ ...defaultBranding(), logoUrl: form.logoUrl });
  }

  async function handleRegenerateToken() {
    if (!window.confirm("Regenerating the embed token immediately breaks every snippet already deployed on your site until you replace it with the new one. Continue?")) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/regenerate-embed-token`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.embedToken) {
        setEmbedToken(data.embedToken);
        updateWorkspaceInStore({ embedToken: data.embedToken });
      }
    } finally {
      setRegenerating(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${origin}/widget.js?w=${embedToken}" async></script>`;
  const previewUrl = `/embed/${embedToken}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function goToSection(id: string) {
    setActiveSection(id);
    document.getElementById(`branding-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function chooseScreen(next: PreviewScreen) {
    setScreen(next);
    if (next === "launcher") setDevice("mobile");
  }

  function chooseDevice(next: PreviewDevice) {
    setDevice(next);
    if (next === "desktop" && screen === "launcher") setScreen("chat");
  }

  React.useEffect(() => {
    loadGoogleFont(form.fontFamily);
  }, [form.fontFamily]);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) void handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, handleSave]);

  React.useEffect(() => {
    const root = document.getElementById("branding-settings-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id.replace("branding-", ""));
      },
      { root, rootMargin: "0px 0px -55% 0px" }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(`branding-${s.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const brandStyle: React.CSSProperties = {
    ...resolveBrandCssVars(form.primaryColor),
    fontFamily: fontFamilyCssValue(form.fontFamily),
  };
  const contrast = whiteContrast(form.primaryColor);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 gap-6 overflow-hidden px-6 pt-4 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
        {/* ── Settings column ─────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="shrink-0 pb-4">
            <nav className="flex gap-1 overflow-x-auto scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-1 shadow-[var(--shadow-card)]">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => goToSection(id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-medium transition-colors",
                    activeSection === id
                      ? "bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div id="branding-settings-scroll" className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-6 sidebar-scroll">
          {/* Identity */}
          <Section id="identity" title="Identity" description="Who shoppers are talking to.">
            <TextField
              label="Agent name"
              value={form.agentName}
              max={BRANDING_LIMITS.agentName}
              onChange={(agentName) => update({ agentName })}
              hint="Shown in the chat header and on the sign-in screen."
            />

            <Field label="Logo" hint="Square images look best. PNG, JPG, WEBP or SVG, up to 2 MB.">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  handleLogoFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => logoInputRef.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && logoInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleLogoFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed px-3 py-3 transition-colors",
                  dragOver
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-brand)]/60"
                )}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-base)]">
                  {form.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    <Upload className="h-5 w-5 text-[var(--color-text-muted)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {form.logoUrl ? "Replace logo" : "Upload logo"}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">Click or drop an image here</p>
                </div>
                {form.logoUrl && (
                  <button
                    type="button"
                    aria-label="Remove logo"
                    onClick={(e) => {
                      e.stopPropagation();
                      update({ logoUrl: null });
                      setLogoError(null);
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {logoError && <p className="mt-1.5 text-xs text-[var(--color-error)]">{logoError}</p>}
            </Field>

            <TextField
              label="Status line"
              value={form.statusText}
              max={BRANDING_LIMITS.statusText}
              onChange={(statusText) => update({ statusText })}
              hint="The small line under the agent name."
            />
          </Section>

          {/* Appearance */}
          <Section id="appearance" title="Appearance" description="Match the widget to your storefront.">
            <Field label="Theme">
              <div className="grid grid-cols-2 gap-2">
                {(["light", "dark"] as WorkspaceTheme[]).map((theme) => (
                  <ThemeCard
                    key={theme}
                    theme={theme}
                    color={form.primaryColor}
                    active={form.theme === theme}
                    onSelect={() => update({ theme })}
                  />
                ))}
              </div>
            </Field>

            <Field
              label="Studio backdrop"
              hint="The fixed background behind every shopper's avatar. Shoppers can't change it."
            >
              <div className="grid grid-cols-4 gap-2">
                {STUDIO_BACKDROPS.map((bg) => {
                  const active = (form.studioBackdropId || "backdrop-1") === bg.id;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      title={bg.label}
                      aria-label={bg.label}
                      onClick={() => update({ studioBackdropId: bg.id })}
                      className={cn(
                        "relative aspect-[3/4] overflow-hidden rounded-[var(--radius-md)] border-2 transition-all",
                        active ? "border-[var(--color-brand)]" : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                      )}
                    >
                      <img src={bg.url} alt="" className="h-full w-full object-cover" />
                      {active && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-brand)]">
                          <Check className="h-2.5 w-2.5 text-[var(--color-brand-contrast)]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Brand color" hint="Used for buttons, your shopper's messages, and highlights.">
              <div className="flex flex-wrap items-center gap-2">
                {BRAND_COLOR_PRESETS.map((color) => {
                  const active = form.primaryColor.toLowerCase() === color.toLowerCase();
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setColor(color)}
                      title={color}
                      aria-label={`Use ${color}`}
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-offset-2 ring-offset-[var(--color-surface-card)] transition-transform",
                        active ? "ring-2 ring-[var(--color-text-primary)]" : "hover:scale-110"
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {active && <Check className="h-3.5 w-3.5" style={{ color: whiteContrast(color) >= 3 ? "#fff" : "#17121d" }} />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <label
                  className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]"
                  style={{ backgroundColor: form.primaryColor }}
                  title="Pick any color"
                >
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <input
                  type="text"
                  maxLength={7}
                  value={hexInput}
                  onChange={(e) => handleHex(e.target.value.trim())}
                  onBlur={() => setHexInput(form.primaryColor)}
                  spellCheck={false}
                  className={cn(
                    "h-9 w-28 rounded-[var(--radius-md)] border bg-[var(--color-surface-card)] px-3 font-mono text-sm uppercase text-[var(--color-text-primary)] focus:outline-none",
                    HEX_COLOR.test(hexInput) ? "border-[var(--color-border)] focus:border-[var(--color-brand)]" : "border-[var(--color-error)]"
                  )}
                />
                <ContrastBadge ratio={contrast} />
              </div>
              {contrast < 3 && (
                <p className="mt-2 text-xs text-[var(--color-warning)]">
                  White text on this color is hard to read. Pick a darker shade so buttons stay legible.
                </p>
              )}
            </Field>

            <Field label="Font">
              <FontPicker value={form.fontFamily} onChange={(fontFamily) => update({ fontFamily })} />
            </Field>

            <RadiusField value={form.borderRadius} onChange={(borderRadius) => update({ borderRadius })} />
          </Section>

          {/* Conversation */}
          <Section id="conversation" title="Conversation" description="The words shoppers see first.">
            <TextField
              multiline
              label="Welcome message"
              value={form.welcomeMessage}
              max={BRANDING_LIMITS.welcomeMessage}
              onChange={(welcomeMessage) => update({ welcomeMessage })}
              hint="The agent's first message once the shopper's avatar is ready."
            />

            <Field
              label="Suggested replies"
              hint="Tappable chips shown before the shopper's first message. Tapping one sends it."
            >
              <SegmentedTabs
                items={[
                  { id: "default", label: "Persona's" },
                  { id: "custom", label: "Custom" },
                  { id: "off", label: "Off" },
                ]}
                activeId={replyMode}
                onSelect={(id) => changeReplyMode(id as ReplyMode)}
              />
              {replyMode === "default" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {WEARABLE_QUICK_REPLIES.map((q) => (
                    <span key={q.label} className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
                      {q.label}
                    </span>
                  ))}
                </div>
              )}
              {replyMode === "custom" && (
                <div className="mt-3 space-y-2">
                  {(form.quickReplies ?? []).map((reply, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={reply}
                        maxLength={BRANDING_LIMITS.quickReply}
                        onChange={(e) => editReply(index, e.target.value)}
                        className="h-9 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Remove suggestion"
                        onClick={() => removeReply(index)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {(form.quickReplies?.length ?? 0) < BRANDING_LIMITS.quickReplies && (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (replyDraft.trim()) addReply();
                      }}
                    >
                      <input
                        value={replyDraft}
                        maxLength={BRANDING_LIMITS.quickReply}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder="e.g. Summer dresses"
                        className="h-9 flex-1 rounded-full border border-dashed border-[var(--color-border)] bg-transparent px-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
                      />
                      <Button type="submit" size="sm" variant="secondary" disabled={!replyDraft.trim()} className="gap-1">
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </form>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {form.quickReplies?.length ?? 0} of {BRANDING_LIMITS.quickReplies}
                    {(form.quickReplies?.length ?? 0) === 0 && ". With none added, no chips are shown."}
                  </p>
                </div>
              )}
            </Field>

            <TextField
              label="Input placeholder"
              value={form.inputPlaceholder}
              max={BRANDING_LIMITS.inputPlaceholder}
              onChange={(inputPlaceholder) => update({ inputPlaceholder })}
            />

            <TextField
              multiline
              label="Sign-in message"
              value={form.signInMessage}
              max={BRANDING_LIMITS.signInMessage}
              onChange={(signInMessage) => update({ signInMessage })}
              hint="Shown under “Sign in to your agent” on the first screen."
              onFocus={() => chooseScreen("sign-in")}
            />

            <TextField
              label="Mobile chat button"
              value={form.launcherLabel}
              max={BRANDING_LIMITS.launcherLabel}
              onChange={(launcherLabel) => update({ launcherLabel })}
              hint="Label on the collapsed chat button on phones."
              onFocus={() => chooseScreen("launcher")}
            />
          </Section>

          {/* Setup */}
          <Section id="setup" title="Setup" description="Choose what shoppers can do and put the agent on your store.">
            <ToggleRow
              title="Live camera try-on"
              description="Show the Live camera button in the fitting room. Turn off to keep photo try-on only."
              checked={form.liveTryOnEnabled !== false}
              onChange={(liveTryOnEnabled) => update({ liveTryOnEnabled })}
            />

            <ToggleRow
              title="Public embed"
              description="Turn off to stop the snippet from working immediately."
              checked={embedEnabled}
              onChange={setEmbedEnabled}
            />

            <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand)]" />
              <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                Virtual Try-On always embeds as a <strong className="text-[var(--color-text-primary)]">full-page</strong> experience, because image generation needs the full viewport.
              </p>
            </div>

            <CatalogReadyGate variant="inline" label="The embed snippet" enabled>
              <div className="space-y-3">
                <div className="relative rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3 pr-11 font-mono text-xs leading-relaxed break-all text-[var(--color-text-secondary)]">
                  {snippet}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] transition-colors hover:border-[var(--color-brand)]"
                    title="Copy"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-success)]" /> : <Copy className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />}
                  </button>
                </div>
                <ol className="list-decimal space-y-1 pl-4 text-xs text-[var(--color-text-muted)]">
                  <li>Copy the snippet.</li>
                  <li>
                    Paste it before <code>&lt;/body&gt;</code> on the page that should show the agent.
                  </li>
                  <li>
                    To place it inside a specific container, add <code>data-target=&quot;#el&quot;</code> to the script tag.
                  </li>
                </ol>
                <div className="flex gap-2">
                  <Link href={previewUrl} target="_blank" className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      Open as a customer
                    </Button>
                  </Link>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    loading={regenerating}
                    onClick={handleRegenerateToken}
                    title="Regenerate embed token. Every deployed snippet stops working."
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    New token
                  </Button>
                </div>
              </div>
            </CatalogReadyGate>
          </Section>
          </div>
        </div>

        {/* ── Preview column ─────────────────────────────────────────── */}
        <div className="min-h-0 min-w-0 pb-4">
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Live preview</p>
              <IconToggle
                options={[
                  { id: "chat", label: "Chat" },
                  { id: "sign-in", label: "Sign-in" },
                  { id: "launcher", label: "Mobile button" },
                ]}
                value={screen}
                onChange={(id) => chooseScreen(id as PreviewScreen)}
              />
              <IconToggle
                options={[
                  { id: "desktop", label: "Desktop", icon: <Monitor className="h-3.5 w-3.5" /> },
                  { id: "mobile", label: "Mobile", icon: <Smartphone className="h-3.5 w-3.5" /> },
                ]}
                value={device}
                iconOnly
                onChange={(id) => chooseDevice(id as PreviewDevice)}
              />
              <button
                type="button"
                onClick={() => update({ theme: form.theme === "dark" ? "light" : "dark" })}
                title={form.theme === "dark" ? "Switch to light" : "Switch to dark"}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                {form.theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:18px_18px] p-4">
              {device === "desktop" ? (
                <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)]">
                  <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2.5">
                    <span className="h-3 w-3 rounded-full bg-red-400" />
                    <span className="h-3 w-3 rounded-full bg-amber-400" />
                    <span className="h-3 w-3 rounded-full bg-green-400" />
                    <div className="ml-2 flex h-5 flex-1 items-center rounded-full bg-[var(--color-surface-base)] px-3 text-[10px] text-[var(--color-text-muted)]">
                      yourstore.com
                    </div>
                  </div>
                  <div
                    className={cn("embed-preview-surface relative min-h-0 flex-1 overflow-hidden bg-[var(--color-surface-base)] p-4", form.theme === "dark" && "dark")}
                    style={brandStyle}
                  >
                    <BrandingAgentPreview branding={form} device={device} screen={screen} />
                  </div>
                </div>
              ) : (
                <div className="flex h-full max-h-[760px] aspect-[9/19] flex-col overflow-hidden rounded-[44px] border-[10px] border-[#0d0b10] bg-[#0d0b10] shadow-[var(--shadow-elevated)]">
                  <div className="relative flex h-6 shrink-0 items-center justify-center">
                    <span className="h-4 w-20 rounded-full bg-black" />
                  </div>
                  <div
                    className={cn("embed-preview-surface relative min-h-0 flex-1 overflow-hidden rounded-[30px] bg-[var(--color-surface-base)]", form.theme === "dark" && "dark")}
                    style={brandStyle}
                  >
                    <BrandingAgentPreview branding={form} device={device} screen={screen} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <span>Updates as you type. Shoppers see it after you save.</span>
              <Link href="/preview" className="inline-flex items-center gap-1 font-medium text-[var(--color-brand)] hover:underline">
                Try the real agent <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Save bar ───────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface-card)] px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto flex items-center gap-2 text-sm">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                saveError ? "bg-[var(--color-error)]" : dirty ? "bg-[var(--color-warning)]" : "bg-[var(--color-success)]"
              )}
            />
            <span className={cn(saveError ? "text-[var(--color-error)]" : "text-[var(--color-text-secondary)]")}>
              {saveError ?? (dirty ? "Unsaved changes" : justSaved ? "Saved" : "All changes saved")}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleResetDefaults} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDiscard} disabled={!dirty || saving}>
            Discard
          </Button>
          <Button size="sm" loading={saving} onClick={handleSave} disabled={!dirty} title="Save (Ctrl+S)">
            {justSaved && !dirty ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Building blocks ───────────────────────────────────────────────────── */

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={`branding-${id}`} className="card-base scroll-mt-4 space-y-5 p-5">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

type RadiusMode = "square" | "rounded" | "custom";

function radiusMode(value: string): RadiusMode {
  if (value === RADIUS_SQUARE) return "square";
  if (value === RADIUS_ROUNDED) return "rounded";
  return "custom";
}

function RadiusField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const mode = radiusMode(value);
  const px = Number.parseInt(value, 10) || 0;
  const [draft, setDraft] = React.useState(String(px));

  function commit(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    const clamped = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Number(digits)));
    onChange(`${clamped}px`);
  }

  const options: { id: RadiusMode; label: string; radius: string }[] = [
    { id: "square", label: "Square", radius: RADIUS_SQUARE },
    { id: "rounded", label: "Rounded", radius: RADIUS_ROUNDED },
    { id: "custom", label: "Custom", radius: value === RADIUS_SQUARE || value === RADIUS_ROUNDED ? "8px" : value },
  ];

  return (
    <Field label="Border radius" hint="Sets every corner in the preview: the frame, messages, cards, and the input.">
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const active = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.radius)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border px-2 py-3 text-xs font-medium transition-colors",
                active
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)]/50"
              )}
            >
              <span
                className={cn("h-6 w-9 border-2", active ? "border-[var(--color-brand)]" : "border-[var(--color-text-muted)]")}
                style={{ borderRadius: option.id === "custom" ? "6px" : option.radius }}
              />
              {option.label}
            </button>
          );
        })}
      </div>
      {mode === "custom" && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(e.target.value);
            }}
            onBlur={() => setDraft(String(Number.parseInt(value, 10) || 0))}
            className="h-9 w-24 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-sm tabular-nums text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
          />
          <span className="text-sm text-[var(--color-text-muted)]">px</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {RADIUS_MIN}–{RADIUS_MAX}
          </span>
        </div>
      )}
    </Field>
  );
}

function TextField({
  label,
  value,
  max,
  onChange,
  hint,
  multiline = false,
  onFocus,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
  onFocus?: () => void;
}) {
  const id = React.useId();
  const inputClass =
    "w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]";
  const nearLimit = value.length >= max * 0.9;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-[var(--color-text-secondary)]">{label}</label>
        <span className={cn("text-[11px] tabular-nums", nearLimit ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]")}>
          {value.length}/{max}
        </span>
      </div>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          maxLength={max}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          className={cn(inputClass, "resize-none py-2 leading-relaxed")}
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={max}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          className={cn(inputClass, "h-9")}
        />
      )}
      {hint && <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-3 py-3">
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--color-brand)]" : "bg-[var(--color-border-strong)]"
        )}
      >
        <span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </button>
    </div>
  );
}

function ThemeCard({ theme, color, active, onSelect }: { theme: WorkspaceTheme; color: string; active: boolean; onSelect: () => void }) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border-2 text-left transition-colors",
        active ? "border-[var(--color-brand)]" : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50"
      )}
    >
      <div className={cn("space-y-1.5 p-3", dark ? "bg-[#17121d]" : "bg-[#f6f4f8]")}>
        <div className={cn("h-2 w-12 rounded", dark ? "bg-white/25" : "bg-black/15")} />
        <div className={cn("h-4 w-20 rounded-md", dark ? "bg-white/10" : "bg-white")} />
        <div className="ml-auto h-4 w-14 rounded-md" style={{ backgroundColor: color }} />
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--color-text-primary)]">
        <span className="flex items-center gap-1.5">
          {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          {dark ? "Dark" : "Light"}
        </span>
        {active && <Check className="h-3.5 w-3.5 text-[var(--color-brand)]" />}
      </div>
    </button>
  );
}

function ContrastBadge({ ratio }: { ratio: number }) {
  const tone =
    ratio >= 4.5
      ? { label: "AA", cls: "bg-[var(--color-success-light)] text-[var(--color-success)]" }
      : ratio >= 3
        ? { label: "AA Large", cls: "bg-[var(--color-warning-light)] text-[var(--color-warning)]" }
        : { label: "Low contrast", cls: "bg-[var(--color-error-light)] text-[var(--color-error)]" };
  return (
    <span
      className={cn("rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums", tone.cls)}
      title="Contrast of white text on your brand color (WCAG)"
    >
      {tone.label} · {ratio.toFixed(1)}:1
    </span>
  );
}

function IconToggle({
  options,
  value,
  onChange,
  iconOnly = false,
}: {
  options: { id: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  iconOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          title={o.label}
          aria-pressed={value === o.id}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[6px] text-xs font-medium transition-colors",
            iconOnly ? "w-7 justify-center" : "px-2.5",
            value === o.id
              ? "bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          )}
        >
          {o.icon}
          {!iconOnly && o.label}
        </button>
      ))}
    </div>
  );
}
