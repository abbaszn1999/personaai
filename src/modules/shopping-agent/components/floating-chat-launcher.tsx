"use client";

import * as React from "react";
import { MessageCircle, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ChatInterface } from "./chat-interface";
import type { EmbedRuntimeConfig } from "@/lib/embed/client/types";

interface FloatingChatLauncherProps {
  embed?: EmbedRuntimeConfig;
  agentName: string;
  welcomeMessage?: string;
  logoUrl?: string | null;
  primaryColor: string;
  borderRadius: string;
  /** "bottom-right" | "bottom-left" — anything else falls back to bottom-right. */
  position: string;
}

/** Collapsed pill that expands into a chat panel — same component the public widget mounts
 *  for unwearable `displayMode: "floating"`. */
export function FloatingChatLauncher({
  embed,
  agentName,
  welcomeMessage,
  logoUrl,
  primaryColor,
  borderRadius,
  position,
}: FloatingChatLauncherProps) {
  const [open, setOpen] = React.useState(false);
  const sideClass = position === "bottom-left" ? "left-5" : "right-5";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-5 z-[2147483000] flex items-center gap-2 shadow-xl px-4 py-2.5 transition-transform hover:scale-105",
            sideClass
          )}
          style={{ background: primaryColor, borderRadius }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
          ) : (
            <MessageCircle className="h-4 w-4 text-white" />
          )}
          <span className="text-white text-sm font-semibold">{agentName}</span>
        </button>
      )}

      {open && (
        <div
          className={cn(
            "fixed bottom-5 z-[2147483000] w-[360px] max-w-[92vw] h-[560px] max-h-[80vh] shadow-2xl overflow-hidden flex flex-col",
            sideClass
          )}
          style={{ borderRadius }}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: primaryColor }}>
            <div className="flex items-center gap-2 min-w-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-white/25 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {agentName.charAt(0)}
                </div>
              )}
              <p className="text-white text-sm font-semibold leading-none truncate">{agentName}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
              aria-label="Minimize chat"
            >
              <Minimize2 className="h-3 w-3 text-white" />
            </button>
          </div>

          <div className="flex-1 min-h-0 bg-[var(--color-surface-card)]">
            <ChatInterface
              viewportMode="mobile"
              embed={embed}
              branding={{ agentName, welcomeMessage, logoUrl, borderRadius: "0px" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
