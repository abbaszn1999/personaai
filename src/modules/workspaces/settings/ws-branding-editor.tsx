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
  Upload,
  X,
  MessageCircle,
  Send,
  Minimize2,
  ShoppingBag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BRAND_COLOR_PRESETS } from "@/modules/settings/mocks/defaults";
import type { Workspace } from "@/modules/workspaces/types";
import { cn } from "@/lib/utils/cn";

/* ── Constants ─────────────────────────────────────────────────────────── */

const FONT_OPTIONS = [
  { value: "Inter",     label: "Inter" },
  { value: "Poppins",   label: "Poppins" },
  { value: "DM Sans",   label: "DM Sans" },
  { value: "system-ui", label: "System default" },
];

const RADIUS_OPTIONS = [
  { value: "4px",   label: "Sharp" },
  { value: "12px",  label: "Rounded" },
  { value: "999px", label: "Pill" },
];

const POSITION_OPTIONS = [
  { value: "bottom-right", label: "Bottom-right" },
  { value: "bottom-left",  label: "Bottom-left" },
];

type DisplayMode = "floating" | "fullpage";

interface BrandingState {
  agentName: string;
  welcomeMessage: string;
  logoUrl: string | null;
  primaryColor: string;
  hexInput: string;
  fontFamily: string;
  borderRadius: string;
  position: string;
  displayMode: DisplayMode;
}

/* ── Main component ─────────────────────────────────────────────────────── */

interface Props { workspace: Workspace }

export function WsBrandingEditor({ workspace }: Props) {
  const isWearable = workspace.mode === "wearable";

  const [form, setForm] = React.useState<BrandingState>({
    agentName: "Maya",
    welcomeMessage: "Hi! How can I help you today?",
    logoUrl: null,
    primaryColor: "#f76d01",
    hexInput: "#f76d01",
    fontFamily: "Inter",
    borderRadius: "12px",
    position: "bottom-right",
    // wearable is always full-page; unwearable defaults to floating
    displayMode: isWearable ? "fullpage" : "floating",
  });

  const [saved, setSaved]   = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [widgetOpen, setWidgetOpen] = React.useState(true);

  function update(patch: Partial<BrandingState>) {
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
    await new Promise((r) => setTimeout(r, 700));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // wearable always forces fullpage in the snippet
  const effectiveMode: DisplayMode = isWearable ? "fullpage" : form.displayMode;

  const snippet = effectiveMode === "floating"
    ? `<script src="https://shopagent.io/widget.js?workspace=${workspace.id}&color=${encodeURIComponent(form.primaryColor)}&font=${encodeURIComponent(form.fontFamily)}" async></script>`
    : `<script src="https://shopagent.io/widget.js?workspace=${workspace.id}&mode=fullpage&color=${encodeURIComponent(form.primaryColor)}&font=${encodeURIComponent(form.fontFamily)}" async></script>`;

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Position control is only relevant for floating mode on unwearable workspaces
  const showPosition = !isWearable && form.displayMode === "floating";

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
              {form.logoUrl ? (
                <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-4 py-2.5">
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ background: form.primaryColor }}
                  >
                    {form.agentName.charAt(0).toUpperCase()}
                  </div>
                  <p className="flex-1 text-sm text-[var(--color-success)]">Logo uploaded ✓</p>
                  <button
                    onClick={() => update({ logoUrl: null })}
                    className="h-5 w-5 rounded-full hover:bg-red-50 flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border)] px-4 py-2.5 cursor-pointer hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-colors"
                  onClick={() => update({ logoUrl: "/mock-logo.png" })}
                >
                  <Upload className="h-4 w-4 text-[var(--color-text-muted)]" />
                  <div>
                    <p className="text-sm text-[var(--color-text-secondary)]">Upload logo</p>
                    <p className="text-xs text-[var(--color-text-muted)]">PNG or SVG, max 2 MB</p>
                  </div>
                </div>
              )}
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
              <select
                value={form.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value })}
                className="h-9 px-3 text-sm bg-[var(--color-surface-card)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-brand)]"
              >
                {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
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
              Paste before <code>&lt;/body&gt;</code>. Theme is baked in automatically.
            </p>

            <Link href={`/workspaces/${workspace.id}/embed`} target="_blank">
              <Button variant="secondary" size="sm" className="w-full gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Preview as Customer
              </Button>
            </Link>
          </ControlGroup>

          {/* Save */}
          <div className="flex justify-end pb-4">
            <Button size="sm" loading={saving} onClick={handleSave}>
              {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Right: Live preview ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">Live Preview</p>
          <span className="text-xs text-[var(--color-text-muted)]">Updates as you type</span>
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

          {/* Page body */}
          <div className="relative flex-1 overflow-hidden">
            {/* Faint product grid background */}
            <div className="p-6 grid grid-cols-3 gap-4 opacity-[0.12] pointer-events-none select-none">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-[var(--color-text-muted)] aspect-[3/4]" />
              ))}
            </div>

            {/* ── Floating widget (unwearable only) ── */}
            {effectiveMode === "floating" && (
              <>
                {!widgetOpen && (
                  <button
                    onClick={() => setWidgetOpen(true)}
                    className={cn(
                      "absolute bottom-5 flex items-center gap-2 shadow-xl px-4 py-2.5 transition-all",
                      form.position === "bottom-right" ? "right-5" : "left-5"
                    )}
                    style={{ background: form.primaryColor, borderRadius: form.borderRadius, fontFamily: form.fontFamily }}
                  >
                    <MessageCircle className="h-4 w-4 text-white" />
                    <span className="text-white text-sm font-semibold">{form.agentName}</span>
                  </button>
                )}

                {widgetOpen && (
                  <div
                    className={cn(
                      "absolute bottom-5 w-72 shadow-2xl overflow-hidden flex flex-col",
                      form.position === "bottom-right" ? "right-5" : "left-5"
                    )}
                    style={{ borderRadius: form.borderRadius, fontFamily: form.fontFamily, height: "360px" }}
                  >
                    {/* Header */}
                    <div
                      className="flex items-center justify-between px-4 py-3 shrink-0"
                      style={{ background: form.primaryColor }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-white/25 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {form.agentName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold leading-none">{form.agentName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-300" />
                            <span className="text-white/70 text-[10px]">Online</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setWidgetOpen(false)}
                        className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                      >
                        <Minimize2 className="h-3 w-3 text-white" />
                      </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 bg-white p-3 overflow-hidden space-y-2">
                      <MockAgentBubble
                        initial={form.agentName.charAt(0)}
                        color={form.primaryColor}
                        radius={form.borderRadius}
                        text={form.welcomeMessage}
                      />
                      <MockUserBubble color={form.primaryColor} radius={form.borderRadius} text="Can you show me some options?" />
                      <MockAgentBubble
                        initial={form.agentName.charAt(0)}
                        color={form.primaryColor}
                        radius={form.borderRadius}
                        text="Of course! Here are my top picks for you:"
                      />
                      <MiniProductRow color={form.primaryColor} radius={form.borderRadius} />
                    </div>

                    {/* Input */}
                    <div className="bg-white border-t border-gray-100 px-3 py-2.5 flex items-center gap-2 shrink-0">
                      <div className="flex-1 h-7 bg-gray-100 rounded-full px-3 text-[10px] text-gray-400 flex items-center">
                        Type a message…
                      </div>
                      <div
                        className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: form.primaryColor }}
                      >
                        <Send className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Full-page widget (wearable always; unwearable when fullpage selected) ── */}
            {effectiveMode === "fullpage" && (
              <div
                className="absolute inset-4 flex flex-col overflow-hidden shadow-lg"
                style={{ borderRadius: form.borderRadius, fontFamily: form.fontFamily }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-5 py-3.5 shrink-0"
                  style={{ background: form.primaryColor }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-white/25 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {form.agentName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm leading-none">{form.agentName}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-300" />
                        <span className="text-white/70 text-[10px]">Online</span>
                      </div>
                    </div>
                  </div>
                  <Minimize2 className="h-4 w-4 text-white/50" />
                </div>

                {/* Messages area */}
                <div className="flex-1 bg-white px-4 py-4 overflow-hidden space-y-3">
                  <MockAgentBubble
                    initial={form.agentName.charAt(0)}
                    color={form.primaryColor}
                    radius={form.borderRadius}
                    text={form.welcomeMessage}
                    large
                  />
                  <MockUserBubble
                    color={form.primaryColor}
                    radius={form.borderRadius}
                    text={isWearable ? "I want to try on that red jacket." : "Can you show me some options?"}
                    large
                  />
                  <MockAgentBubble
                    initial={form.agentName.charAt(0)}
                    color={form.primaryColor}
                    radius={form.borderRadius}
                    text={isWearable ? "Great choice! I'll generate a try-on image with that jacket for you." : "Of course! Here are my top picks for you:"}
                    large
                  />
                  {!isWearable && (
                    <MiniProductRow color={form.primaryColor} radius={form.borderRadius} large />
                  )}
                  {isWearable && (
                    <TryOnImagePlaceholder color={form.primaryColor} radius={form.borderRadius} />
                  )}
                </div>

                {/* Input */}
                <div className="bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
                  <div className="flex-1 h-8 bg-gray-100 rounded-full px-4 text-xs text-gray-400 flex items-center">
                    {isWearable ? "Ask about sizing, style, or try an outfit…" : "Ask about products, prices, delivery…"}
                  </div>
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: form.primaryColor }}
                  >
                    <Send className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components for mock messages ────────────────────────────────────── */

interface BubbleProps {
  initial: string;
  color: string;
  radius: string;
  text: string;
  large?: boolean;
}

function MockAgentBubble({ initial, color, radius, text, large }: BubbleProps) {
  return (
    <div className="flex items-start gap-2">
      <div
        className={cn(
          "flex items-center justify-center text-white font-bold shrink-0 mt-0.5",
          large ? "h-7 w-7 text-xs" : "h-5 w-5 text-[9px]"
        )}
        style={{ background: color, borderRadius: radius === "999px" ? "999px" : "8px" }}
      >
        {initial}
      </div>
      <div
        className={cn(
          "bg-gray-100 text-gray-800 max-w-[75%]",
          large ? "text-xs px-3 py-2" : "text-[10px] px-2.5 py-1.5"
        )}
        style={{ borderRadius: radius }}
      >
        {text}
      </div>
    </div>
  );
}

function MockUserBubble({ color, radius, text, large }: Omit<BubbleProps, "initial">) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "text-white max-w-[70%]",
          large ? "text-xs px-3 py-2" : "text-[10px] px-2.5 py-1.5"
        )}
        style={{ background: color, borderRadius: radius }}
      >
        {text}
      </div>
    </div>
  );
}

function MiniProductRow({ color, radius, large }: { color: string; radius: string; large?: boolean }) {
  const items = [
    { name: "Classic Sneakers", price: "$89" },
    { name: "Slim Chinos", price: "$65" },
  ];
  return (
    <div className="flex gap-2 pl-7">
      {items.map((item) => (
        <div
          key={item.name}
          className={cn(
            "bg-gray-50 border border-gray-200 flex flex-col gap-1",
            large ? "p-2 w-28" : "p-1.5 w-20"
          )}
          style={{ borderRadius: radius }}
        >
          <div className="w-full aspect-square bg-gray-200 rounded" />
          <p className={cn("font-medium text-gray-700 truncate", large ? "text-[10px]" : "text-[8px]")}>{item.name}</p>
          <div className="flex items-center justify-between">
            <p className={cn("text-gray-500", large ? "text-[10px]" : "text-[8px]")}>{item.price}</p>
            <div
              className="h-4 w-4 rounded flex items-center justify-center"
              style={{ background: color }}
            >
              <ShoppingBag className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TryOnImagePlaceholder({ color, radius }: { color: string; radius: string }) {
  return (
    <div className="flex gap-3 pl-7 items-start">
      <div
        className="w-28 aspect-[2/3] border-2 flex flex-col items-center justify-center gap-1 shrink-0"
        style={{ borderColor: color, borderRadius: radius }}
      >
        <div className="h-10 w-10 rounded-full bg-gray-200" />
        <div className="h-16 w-10 bg-gray-200 rounded" />
        <p className="text-[8px] text-gray-400 mt-1">Try-on preview</p>
      </div>
      <div className="space-y-1 pt-1">
        <p className="text-[9px] font-semibold text-gray-700">Red Knit Jacket</p>
        <p className="text-[9px] text-gray-500">Size: M · Recommended ✓</p>
        <div
          className="text-[9px] text-white px-2 py-1 inline-block"
          style={{ background: color, borderRadius: radius }}
        >
          Add to cart
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
