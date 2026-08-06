"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Eye,
  Info,
  Monitor,
  MousePointer,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BRAND_COLOR_PRESETS } from "@/modules/settings/mocks/defaults";
import type { Workspace, WorkspaceBranding, WorkspaceTheme } from "@/modules/workspaces/types";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { cn } from "@/lib/utils/cn";
import { FontPicker } from "./font-picker";
import { fontFamilyCssValue, loadGoogleFont } from "@/lib/fonts/google-fonts";
import { resolveBrandCssVars } from "@/lib/branding/resolve-brand-vars";
import { BrandingAgentPreview } from "./branding-agent-preview";

/* ── Constants ─────────────────────────────────────────────────────────── */

const RADIUS_OPTIONS = [
  { value: "4px",   label: "Sharp" },
  { value: "12px",  label: "Rounded" },
  { value: "999px", label: "Pill" },
];

const POSITION_OPTIONS = [
  { value: "bottom-right", label: "Bottom-right" },
  { value: "bottom-left",  label: "Bottom-left" },
];

const THEME_OPTIONS: { value: WorkspaceTheme; label: string }[] = [
  { value: "dark",  label: "Dark" },
  { value: "light", label: "Light" },
];

type DisplayMode = "floating" | "fullpage";

interface BrandingFormState extends WorkspaceBranding {
  hexInput: string;
}

/* ── Main component ─────────────────────────────────────────────────────── */

interface Props { workspace: Workspace }

export function WsBrandingEditor({ workspace }: Props) {
  const isWearable = workspace.mode === "wearable";
  const updateWorkspaceInStore = useWorkspaceStore((s) => s.updateWorkspace);

  const [form, setForm] = React.useState<BrandingFormState>({
    ...workspace.branding,
    hexInput: workspace.branding.primaryColor,
  });
  const [embedEnabled, setEmbedEnabled] = React.useState(workspace.embedEnabled);
  const [embedToken, setEmbedToken] = React.useState(workspace.embedToken);

  const [saved, setSaved]   = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const MAX_LOGO_BYTES = 2 * 1024 * 1024;

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
    reader.onerror = () => setLogoError("Failed to read that file — please try again");
    reader.readAsDataURL(file);
  }

  function update(patch: Partial<BrandingFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function setColor(color: string) {
    update({ primaryColor: color, hexInput: color });
  }

  function handleHex(val: string) {
    update({ hexInput: val });
    if (/^#[0-9a-fA-F]{6}$/.test(val)) update({ primaryColor: val, hexInput: val });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { hexInput, ...branding } = form;
      void hexInput;
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
      updateWorkspaceInStore(workspace.id, { branding: data.workspace.branding, embedEnabled: data.workspace.embedEnabled });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("Network error — please try again");
    } finally {
      setSaving(false);
    }
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
        updateWorkspaceInStore(workspace.id, { embedToken: data.embedToken });
      }
    } finally {
      setRegenerating(false);
    }
  }

  // wearable always forces fullpage in the snippet
  const effectiveMode: DisplayMode = isWearable ? "fullpage" : form.displayMode;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const snippet = `<script src="${origin}/widget.js?w=${embedToken}" async></script>`;
  const previewUrl = `/embed/${embedToken}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Position control is only relevant for floating mode on unwearable workspaces
  const showPosition = !isWearable && form.displayMode === "floating";

  React.useEffect(() => {
    loadGoogleFont(form.fontFamily);
  }, [form.fontFamily]);

  const brandStyle: React.CSSProperties = {
    ...resolveBrandCssVars(form.primaryColor),
    fontFamily: fontFamilyCssValue(form.fontFamily),
  };

  return (
    <div className="flex gap-6 h-full min-h-[calc(100vh-140px)]">

      {/* ── Left: Controls ──────────────────────────────────────────── */}
      <div className="w-96 shrink-0 flex flex-col gap-0 overflow-y-auto">
        <div className="space-y-6">

          {/* Identity */}
          <ControlGroup title="Identity">
            <Input
              label="Agent Name"
              value={form.agentName}
              onChange={(e) => update({ agentName: e.target.value })}
              hint="Shown in the chat header"
            />
            <Input
              label="Welcome Message"
              value={form.welcomeMessage}
              onChange={(e) => update({ welcomeMessage: e.target.value })}
              hint="First message sent to shoppers"
            />
            {/* Logo */}
            <div>
              <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-1.5">Logo</label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => handleLogoFile(e.target.files?.[0])}
              />
              {form.logoUrl ? (
                <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-4 py-2.5">
                  <img
                    src={form.logoUrl}
                    alt="Logo"
                    className="h-8 w-8 rounded-lg object-cover shrink-0"
                  />
                  <p className="flex-1 text-sm text-[var(--color-success)]">Logo uploaded ✓</p>
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="text-xs font-medium text-[var(--color-brand)] hover:underline shrink-0"
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => { update({ logoUrl: null }); setLogoError(null); }}
                    className="h-5 w-5 rounded-full hover:bg-red-50 flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border)] px-4 py-2.5 cursor-pointer hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-colors"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 text-[var(--color-text-muted)]" />
                  <div>
                    <p className="text-sm text-[var(--color-text-secondary)]">Upload logo</p>
                    <p className="text-xs text-[var(--color-text-muted)]">PNG, JPG, WEBP or SVG, max 2 MB</p>
                  </div>
                </div>
              )}
              {logoError && <p className="mt-1.5 text-xs text-red-500">{logoError}</p>}
            </div>
          </ControlGroup>

          {/* Theme */}
          <ControlGroup title="Theme">
            {/* Color presets + hex */}
            <div>
              <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Primary Color</label>
              <div className="flex flex-wrap items-center gap-2">
                {BRAND_COLOR_PRESETS.map((color) => {
                  const active = form.primaryColor === color;
                  return (
                    <button
                      key={color}
                      onClick={() => setColor(color)}
                      title={color}
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-all shrink-0",
                        active
                          ? "border-[var(--color-text-primary)] scale-110 shadow-[var(--shadow-elevated)]"
                          : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {active && <Check className="h-3.5 w-3.5 text-white mx-auto" />}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1.5 ml-1">
                  <div
                    className="h-7 w-7 rounded-full border border-[var(--color-border)] shrink-0"
                    style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(form.hexInput) ? form.hexInput : "#ccc" }}
                  />
                  <input
                    type="text"
                    maxLength={7}
                    value={form.hexInput}
                    onChange={(e) => handleHex(e.target.value)}
                    placeholder="#f76d01"
                    className="w-20 h-7 px-2 text-xs font-mono bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-brand)]"
                  />
                </div>
              </div>
            </div>

            {/* Font */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--color-text-secondary)]">Font Family</label>
              <FontPicker value={form.fontFamily} onChange={(fontFamily) => update({ fontFamily })} />
            </div>

            {/* Corner style */}
            <div>
              <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Corner Style</label>
              <div className="flex gap-2">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => update({ borderRadius: r.value })}
                    style={{ borderRadius: r.value }}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold border transition-all",
                      form.borderRadius === r.value
                        ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                        : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)]/50"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview theme */}
            <div>
              <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Theme</label>
              <div className="flex gap-2">
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => update({ theme: t.value })}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold rounded-[var(--radius-md)] border transition-all",
                      form.theme === t.value
                        ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                        : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)]/50"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
                Sets a single consistent tone across the whole embed instead of mixing panels.
              </p>
            </div>

            {/* Widget Position — only for floating unwearable */}
            {showPosition && (
              <div>
                <label className="text-sm font-medium text-[var(--color-text-secondary)] block mb-2">Widget Position</label>
                <div className="flex gap-2">
                  {POSITION_OPTIONS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => update({ position: p.value })}
                      className={cn(
                        "flex-1 py-2 text-xs font-semibold rounded-[var(--radius-md)] border transition-all",
                        form.position === p.value
                          ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)]/50"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </ControlGroup>

          {/* Embed */}
          <ControlGroup title="Embed Code">
            {/* Enable/disable the public embed — the token in the snippet only works while this is on */}
            <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Enable public embed</p>
                <p className="text-xs text-[var(--color-text-muted)]">Turn off to immediately stop the snippet from working</p>
              </div>
              <button
                onClick={() => setEmbedEnabled((v) => !v)}
                className={cn(
                  "relative h-6 w-11 rounded-full transition-colors shrink-0",
                  embedEnabled ? "bg-[var(--color-brand)]" : "bg-[var(--color-border-strong)]"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    embedEnabled && "translate-x-5"
                  )}
                />
              </button>
            </div>

            {/* Display mode — only for unwearable (shopping assistant) */}
            {isWearable ? (
              <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-surface-base)] border border-[var(--color-border)] px-3 py-2.5">
                <Info className="h-4 w-4 text-[var(--color-brand)] mt-0.5 shrink-0" />
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Virtual Try-On always embeds as a <strong className="text-[var(--color-text-primary)]">full-page</strong> experience — image generation and navigation require the full viewport.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(["floating", "fullpage"] as DisplayMode[]).map((mode) => {
                  const active = form.displayMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => update({ displayMode: mode })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-[var(--radius-xl)] border p-3 transition-all",
                        active
                          ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
                          : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50"
                      )}
                    >
                      {mode === "floating"
                        ? <MousePointer className={cn("h-4 w-4", active ? "text-[var(--color-brand)]" : "text-[var(--color-text-muted)]")} />
                        : <Monitor className={cn("h-4 w-4", active ? "text-[var(--color-brand)]" : "text-[var(--color-text-muted)]")} />}
                      <p className={cn("text-xs font-semibold", active ? "text-[var(--color-brand)]" : "text-[var(--color-text-primary)]")}>
                        {mode === "floating" ? "Floating" : "Full Page"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Snippet */}
            <div className="relative rounded-[var(--radius-lg)] bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3 pr-10 font-mono text-xs text-[var(--color-text-secondary)] break-all leading-relaxed">
              {snippet}
              <button
                onClick={handleCopy}
                className="absolute top-2.5 right-2.5 h-6 w-6 flex items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-card)] hover:border-[var(--color-brand)] transition-colors"
                title="Copy"
              >
                {copied
                  ? <Check className="h-3 w-3 text-[var(--color-success)]" />
                  : <Copy className="h-3 w-3 text-[var(--color-text-muted)]" />}
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Paste before <code>&lt;/body&gt;</code>. Add a <code>data-target=&quot;#el&quot;</code> attribute to mount it into a specific container instead of right after the script tag.
            </p>

            <div className="flex gap-2">
              <Link href={previewUrl} target="_blank" className="flex-1">
                <Button variant="secondary" size="sm" className="w-full gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Preview as Customer
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                loading={regenerating}
                onClick={handleRegenerateToken}
                title="Regenerate embed token — invalidates every deployed snippet"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </ControlGroup>

          {/* Save */}
          <div className="flex items-center justify-end gap-3 pb-4">
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
            <Button size="sm" loading={saving} onClick={handleSave}>
              {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Right: Visual branding preview (not a live agent) ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">Live Preview</p>
          <span className="text-xs text-[var(--color-text-muted)]">Visual only — updates as you type</span>
        </div>

        {/* Mock browser shell */}
        <div className="flex-1 rounded-[var(--radius-xl)] border border-[var(--color-border)] overflow-hidden flex flex-col bg-[var(--color-surface-base)] min-h-[500px]">
          {/* Chrome bar */}
          <div className="flex items-center gap-1.5 px-3 py-2.5 bg-[var(--color-surface-card)] border-b border-[var(--color-border)] shrink-0">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
            <div className="ml-2 flex-1 h-5 rounded-full bg-[var(--color-surface-base)] text-[10px] text-[var(--color-text-muted)] flex items-center px-3">
              https://yourstore.com
            </div>
          </div>

          <div
            className={cn(
              "embed-preview-surface relative flex-1 overflow-hidden",
              form.theme === "dark" && "dark",
              effectiveMode === "fullpage" && "bg-[var(--color-surface-base)] p-4"
            )}
            style={brandStyle}
          >
            <BrandingAgentPreview
              mode={workspace.mode}
              displayMode={effectiveMode}
              agentName={form.agentName}
              welcomeMessage={form.welcomeMessage}
              logoUrl={form.logoUrl}
              primaryColor={form.primaryColor}
              borderRadius={form.borderRadius}
              position={form.position}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Control group wrapper ────────────────────────────────────────────────── */
function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-base p-4 space-y-4">
      <h4 className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{title}</h4>
      {children}
    </div>
  );
}
