# AutoShopping — Architecture & Restructure Plan

## Final Decision Summary

**Stack stays:** Next.js 16 App Router (no separate Express server)  
**Worker strategy:** Add Trigger.dev/Inngest alongside Next.js only when LLM batch jobs exceed 60s  
**Immediate action:** Restructure `src/` into a `modules/` architecture + add `lib/db/` query layer  

---

## Why This Architecture

| Decision | Reason |
|---|---|
| Keep Next.js full-stack | Real-time conversational agents (2–15s) fit perfectly in streaming route handlers |
| No separate Express server | Same codebase, one deployment, no type bridging needed |
| Add worker service later | Only when catalog indexing / batch agent jobs need >60s — use Trigger.dev, not Express |
| Restructure now | 157 files is the ideal size — painful at 400+ files |

---

## Target Folder Structure

```
src/
│
├── app/                              ← Next.js routing ONLY (thin wrappers)
│   ├── (auth)/                       ← Public auth pages
│   │   ├── sign-in/page.tsx
│   │   ├── sign-up/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── onboarding/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/                  ← Protected dashboard pages
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── workspaces/
│   │   │   ├── page.tsx
│   │   │   └── [id]/                 ← param name matches api/workspaces/[id]/route.ts
│   │   │       ├── page.tsx
│   │   │       ├── assistant/page.tsx
│   │   │       ├── analytics/page.tsx
│   │   │       ├── branding/page.tsx
│   │   │       ├── try-on/page.tsx
│   │   │       ├── settings/page.tsx
│   │   │       └── embed/page.tsx
│   │   ├── setup/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── store/page.tsx
│   │   ├── usage/page.tsx
│   │   └── settings/page.tsx
│   ├── (marketing)/
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/                     ← Auth API routes (delegates to modules/auth)
│   │   │   ├── login/route.ts
│   │   │   ├── register/route.ts
│   │   │   ├── logout/route.ts
│   │   │   ├── verify-email/route.ts
│   │   │   ├── resend-verification/route.ts
│   │   │   ├── forgot-password/route.ts
│   │   │   ├── verify-reset-code/route.ts
│   │   │   ├── reset-password/route.ts
│   │   │   ├── user/route.ts
│   │   │   └── google/
│   │   │       ├── route.ts
│   │   │       └── callback/route.ts
│   │   ├── account/                  ← Account API routes
│   │   │   ├── route.ts
│   │   │   ├── profile/route.ts
│   │   │   ├── change-password/route.ts
│   │   │   ├── set-password/route.ts
│   │   │   ├── sessions/route.ts
│   │   │   └── notifications/route.ts
│   │   ├── workspaces/               ← Workspace CRUD
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── agents/                   ← LLM agent endpoints (NEW — streaming)
│   │   │   ├── shopping/route.ts     ← POST — streaming chat response
│   │   │   └── wearable/route.ts     ← POST — streaming try-on response
│   │   └── onboarding/
│   │       └── complete/route.ts
│   ├── layout.tsx
│   └── page.tsx
│
├── modules/                          ← ONE folder per domain, self-contained
│   │
│   ├── auth/                         ← Everything authentication
│   │   ├── components/               ← SignInForm, SignUpForm, etc.
│   │   │   ├── sign-in-form.tsx
│   │   │   └── sign-up-form.tsx
│   │   ├── context/
│   │   │   └── user-context.tsx      ← was: src/lib/auth/user-context.tsx
│   │   └── lib/
│   │       ├── session.ts            ← was: src/lib/auth/session.ts
│   │       ├── get-user.ts           ← was: src/lib/auth/get-user.ts
│   │       ├── helpers.ts            ← was: src/lib/auth/helpers.ts
│   │       └── google.ts             ← was: src/lib/auth/google.ts
│   │
│   ├── workspaces/                   ← Everything workspaces
│   │   ├── components/
│   │   │   ├── workspace-list.tsx    ← was: features/workspaces/components/
│   │   │   ├── workspace-card.tsx
│   │   │   └── workspace-overview.tsx
│   │   ├── settings/                 ← was: features/workspace-settings/
│   │   │   ├── workspace-settings-dashboard.tsx
│   │   │   ├── ws-general-section.tsx
│   │   │   ├── ws-branding-editor.tsx
│   │   │   ├── ws-categories-section.tsx
│   │   │   └── ws-danger-section.tsx
│   │   ├── hooks/
│   │   │   └── use-workspaces.ts     ← was: features/workspaces/hooks/
│   │   ├── providers/
│   │   │   └── workspaces-bootstrap.tsx  ← was: components/providers/
│   │   ├── store.ts                  ← was: lib/store/workspace-store.ts
│   │   ├── types.ts                  ← was: domain/workspaces/types.ts
│   │   └── constants.ts              ← was: domain/workspaces/constants.ts
│   │
│   ├── onboarding/                   ← Setup wizard
│   │   ├── components/
│   │   │   ├── setup-wizard.tsx
│   │   │   ├── step-name.tsx
│   │   │   ├── step-mode.tsx
│   │   │   ├── step-categories.tsx
│   │   │   └── step-review.tsx
│   │   ├── hooks/
│   │   │   └── use-setup-wizard.ts
│   │   └── schemas/
│   │       └── workspace-setup.ts
│   │
│   ├── settings/                     ← Account settings
│   │   ├── components/
│   │   │   ├── settings-dashboard.tsx
│   │   │   ├── general-settings.tsx
│   │   │   ├── password-settings.tsx
│   │   │   ├── security-settings.tsx
│   │   │   ├── connected-accounts.tsx
│   │   │   ├── notifications-settings.tsx
│   │   │   ├── billing-settings.tsx
│   │   │   └── danger-zone.tsx
│   │   ├── context/
│   │   │   └── settings-profile-context.tsx
│   │   └── mocks/
│   │       └── defaults.ts           ← BRAND_COLOR_PRESETS (used by ws-branding-editor)
│   │       (no hooks/use-settings.ts — superseded by settings-dashboard.tsx +
│   │        settings-profile-context.tsx, which the real account settings UI uses)
│   │
│   ├── analytics/                    ← Analytics dashboard
│   │   ├── components/
│   │   │   ├── analytics-dashboard.tsx
│   │   │   ├── kpi-row.tsx
│   │   │   ├── sales-chart.tsx
│   │   │   ├── conversion-funnel.tsx
│   │   │   ├── workspace-breakdown.tsx
│   │   │   ├── shopper-stats.tsx
│   │   │   ├── top-products-table.tsx
│   │   │   ├── assistant-insights.tsx
│   │   │   └── try-on-insights.tsx
│   │   └── mocks/
│   │       └── analytics-data.ts
│   │
│   ├── store/                        ← E-commerce store connection
│   │   ├── components/
│   │   │   ├── store-dashboard.tsx
│   │   │   ├── connection-card.tsx
│   │   │   ├── connect-store-form.tsx
│   │   │   └── catalog-sync-panel.tsx
│   │   ├── hooks/
│   │   │   └── use-store-connect.ts
│   │   ├── mocks/
│   │   │   └── connections.ts
│   │   ├── types.ts                  ← was: domain/store/types.ts
│   │   └── constants.ts              ← was: domain/store/constants.ts
│   │
│   ├── billing/                      ← Plans, credits & usage (frontend-only, no payment provider yet)
│   │   ├── components/
│   │   │   ├── usage-dashboard.tsx   ← /usage page: images created, remaining credit only
│   │   │   ├── usage-summary-cards.tsx
│   │   │   ├── usage-chart.tsx
│   │   │   ├── plans-section.tsx     ← rendered from Settings > Billing, not /usage
│   │   │   ├── plan-card.tsx
│   │   │   ├── credit-bundles-section.tsx  ← rendered from Settings > Billing, not /usage
│   │   │   ├── credit-bundle-card.tsx
│   │   │   ├── api-key-section.tsx   ← BYO OpenAI key for the chat agent (Settings > API Keys)
│   │   │   └── chat-usage-section.tsx  ← /usage page: BYO-chat lane, separate from Autommerce-metered image credits
│   │   ├── hooks/
│   │   │   └── use-billing.ts
│   │   ├── mocks/
│   │   │   ├── usage-history.ts
│   │   │   └── chat-usage.ts         ← informational-only mock (Autommerce doesn't meter chat)
│   │   ├── store.ts                  ← Zustand — activeTierId, rendersUsed, overageCredits, openaiApiKey (session-local, mirrors store/ globalConnection pattern)
│   │   ├── types.ts
│   │   └── constants.ts              ← PLAN_TIERS (Fixed / Hybrid), CREDIT_BUNDLES, MONTHLY_INCLUDED_RENDERS
│   │
│   ├── shopping-agent/               ← Text shopping assistant (unwearable mode)
│   │   ├── components/
│   │   │   ├── chat-interface.tsx
│   │   │   ├── chat-message.tsx
│   │   │   └── product-recommendation-card.tsx
│   │   ├── hooks/
│   │   │   └── use-shopping-agent.ts
│   │   ├── mocks/
│   │   │   └── responses.ts
│   │   └── types.ts                  ← was: domain/agents/types.ts (shared parts)
│   │
│   └── wearable-agent/               ← Visual try-on agent (wearable mode)
│       ├── components/
│       │   ├── try-on-layout.tsx
│       │   ├── try-on-agent-chat.tsx
│       │   ├── try-on-preview-panel.tsx
│       │   ├── profile-setup-gate.tsx
│       │   ├── body-profile-form.tsx
│       │   └── wearable-chat-message.tsx
│       │   (no outfit-builder-panel.tsx / preview-panel.tsx / product-selector.tsx /
│       │    wearable-product-card.tsx — an earlier non-chat try-on UI, fully
│       │    superseded by the try-on-agent-chat conversational flow above)
│       ├── hooks/
│       │   └── use-try-on-agent.ts   ← use-try-on.ts removed (superseded, see above)
│       ├── mocks/
│       │   ├── products.ts
│       │   └── responses.ts
│       └── types.ts                  ← was: domain/agents/types.ts (wearable parts)
│
├── components/                       ← Truly shared UI — no business logic
│   ├── ui/                           ← Primitives (Button, Card, Input, etc.) — UNCHANGED
│   └── layout/                       ← Shell, sidebar, header — UNCHANGED
│       ├── dashboard-shell.tsx
│       ├── dashboard-header-context.tsx
│       ├── app-sidebar.tsx
│       ├── panel-nav.tsx
│       ├── workspace-switcher.tsx
│       └── sidebar/
│           ├── sidebar-nav-item.tsx
│           ├── sidebar-workspace-card.tsx
│           └── sidebar-preview-cta.tsx
│
├── lib/                              ← Pure infrastructure — zero business logic
│   ├── supabase/                     ← DB client only
│   │   └── server.ts                 ← no client.ts — no client-side Supabase calls
│   │                                    exist (auth is custom cookie sessions, all
│   │                                    DB access is server-side). Add back if/when
│   │                                    client-side Storage uploads or realtime are needed.
│   ├── db/                           ← NEW — reusable DB query functions
│   │   ├── workspaces.ts             ← getWorkspacesByOwner, createWorkspace, etc.
│   │   ├── users.ts                  ← getUserById, updateUser, etc.
│   │   ├── sessions.ts               ← createSession, deleteSession, etc.
│   │   └── notifications.ts          ← getNotificationPrefs, upsertPrefs
│   ├── mock-api/                     ← Temporary mock data (deleted as features go real)
│   │   └── catalog.ts                ← Still needed by categories/store features
│   └── utils/
│       └── cn.ts                     ← UNCHANGED
│
├── styles/
│   └── globals.css                   ← UNCHANGED
│
└── proxy.ts                          ← Route guard — UNCHANGED
```

---

## Complete File Migration Map

Every file — current path → new path:

### `src/lib/auth/` → `src/modules/auth/lib/` and `src/modules/auth/context/`

| Current | New |
|---|---|
| `src/lib/auth/session.ts` | `src/modules/auth/lib/session.ts` |
| `src/lib/auth/get-user.ts` | `src/modules/auth/lib/get-user.ts` |
| `src/lib/auth/helpers.ts` | `src/modules/auth/lib/helpers.ts` |
| `src/lib/auth/google.ts` | `src/modules/auth/lib/google.ts` |
| `src/lib/auth/user-context.tsx` | `src/modules/auth/context/user-context.tsx` |

### `src/lib/store/` → `src/modules/workspaces/`

| Current | New |
|---|---|
| `src/lib/store/workspace-store.ts` | `src/modules/workspaces/store.ts` |

### `src/features/workspaces/` → `src/modules/workspaces/`

| Current | New |
|---|---|
| `src/features/workspaces/components/workspace-list.tsx` | `src/modules/workspaces/components/workspace-list.tsx` |
| `src/features/workspaces/components/workspace-card.tsx` | `src/modules/workspaces/components/workspace-card.tsx` |
| `src/features/workspaces/components/workspace-overview.tsx` | `src/modules/workspaces/components/workspace-overview.tsx` |
| `src/features/workspaces/hooks/use-workspaces.ts` | `src/modules/workspaces/hooks/use-workspaces.ts` |
| `src/features/workspaces/index.ts` | deleted — direct imports replace barrel exports |

### `src/features/workspace-settings/` → `src/modules/workspaces/settings/`

| Current | New |
|---|---|
| `src/features/workspace-settings/components/workspace-settings-dashboard.tsx` | `src/modules/workspaces/settings/workspace-settings-dashboard.tsx` |
| `src/features/workspace-settings/components/ws-general-section.tsx` | `src/modules/workspaces/settings/ws-general-section.tsx` |
| `src/features/workspace-settings/components/ws-branding-editor.tsx` | `src/modules/workspaces/settings/ws-branding-editor.tsx` |
| `src/features/workspace-settings/components/ws-categories-section.tsx` | `src/modules/workspaces/settings/ws-categories-section.tsx` |
| `src/features/workspace-settings/components/ws-danger-section.tsx` | `src/modules/workspaces/settings/ws-danger-section.tsx` |
| `src/features/workspace-settings/index.ts` | deleted |

### `src/components/providers/` → `src/modules/workspaces/providers/`

| Current | New |
|---|---|
| `src/components/providers/workspaces-bootstrap.tsx` | `src/modules/workspaces/providers/workspaces-bootstrap.tsx` |

### `src/features/onboarding/` → `src/modules/onboarding/`

| Current | New |
|---|---|
| `src/features/onboarding/components/setup-wizard.tsx` | `src/modules/onboarding/components/setup-wizard.tsx` |
| `src/features/onboarding/components/step-name.tsx` | `src/modules/onboarding/components/step-name.tsx` |
| `src/features/onboarding/components/step-mode.tsx` | `src/modules/onboarding/components/step-mode.tsx` |
| `src/features/onboarding/components/step-categories.tsx` | `src/modules/onboarding/components/step-categories.tsx` |
| `src/features/onboarding/components/step-review.tsx` | `src/modules/onboarding/components/step-review.tsx` |
| `src/features/onboarding/hooks/use-setup-wizard.ts` | `src/modules/onboarding/hooks/use-setup-wizard.ts` |
| `src/features/onboarding/schemas/workspace-setup.ts` | `src/modules/onboarding/schemas/workspace-setup.ts` |
| `src/features/onboarding/index.ts` | deleted |

### `src/features/settings/` → `src/modules/settings/`

| Current | New |
|---|---|
| `src/features/settings/components/settings-dashboard.tsx` | `src/modules/settings/components/settings-dashboard.tsx` |
| `src/features/settings/components/general-settings.tsx` | `src/modules/settings/components/general-settings.tsx` |
| `src/features/settings/components/password-settings.tsx` | `src/modules/settings/components/password-settings.tsx` |
| `src/features/settings/components/security-settings.tsx` | `src/modules/settings/components/security-settings.tsx` |
| `src/features/settings/components/connected-accounts.tsx` | `src/modules/settings/components/connected-accounts.tsx` |
| `src/features/settings/components/notifications-settings.tsx` | `src/modules/settings/components/notifications-settings.tsx` |
| `src/features/settings/components/billing-settings.tsx` | `src/modules/settings/components/billing-settings.tsx` |
| `src/features/settings/components/danger-zone.tsx` | `src/modules/settings/components/danger-zone.tsx` |
| `src/features/settings/context/settings-profile-context.tsx` | `src/modules/settings/context/settings-profile-context.tsx` |
| `src/features/settings/hooks/use-settings.ts` | `src/modules/settings/hooks/use-settings.ts` |
| `src/features/settings/mocks/defaults.ts` | `src/modules/settings/mocks/defaults.ts` |
| `src/features/settings/index.ts` | deleted |

### `src/features/analytics/` → `src/modules/analytics/`

| Current | New |
|---|---|
| `src/features/analytics/components/analytics-dashboard.tsx` | `src/modules/analytics/components/analytics-dashboard.tsx` |
| `src/features/analytics/components/kpi-row.tsx` | `src/modules/analytics/components/kpi-row.tsx` |
| `src/features/analytics/components/sales-chart.tsx` | `src/modules/analytics/components/sales-chart.tsx` |
| `src/features/analytics/components/conversion-funnel.tsx` | `src/modules/analytics/components/conversion-funnel.tsx` |
| `src/features/analytics/components/workspace-breakdown.tsx` | `src/modules/analytics/components/workspace-breakdown.tsx` |
| `src/features/analytics/components/shopper-stats.tsx` | `src/modules/analytics/components/shopper-stats.tsx` |
| `src/features/analytics/components/top-products-table.tsx` | `src/modules/analytics/components/top-products-table.tsx` |
| `src/features/analytics/components/assistant-insights.tsx` | `src/modules/analytics/components/assistant-insights.tsx` |
| `src/features/analytics/components/try-on-insights.tsx` | `src/modules/analytics/components/try-on-insights.tsx` |
| `src/features/analytics/mocks/analytics-data.ts` | `src/modules/analytics/mocks/analytics-data.ts` |
| `src/features/analytics/index.ts` | deleted |

### `src/features/store-connect/` → `src/modules/store/`

| Current | New |
|---|---|
| `src/features/store-connect/components/store-dashboard.tsx` | `src/modules/store/components/store-dashboard.tsx` |
| `src/features/store-connect/components/connection-card.tsx` | `src/modules/store/components/connection-card.tsx` |
| `src/features/store-connect/components/connect-store-form.tsx` | `src/modules/store/components/connect-store-form.tsx` |
| `src/features/store-connect/components/catalog-sync-panel.tsx` | `src/modules/store/components/catalog-sync-panel.tsx` |
| `src/features/store-connect/hooks/use-store-connect.ts` | `src/modules/store/hooks/use-store-connect.ts` |
| `src/features/store-connect/mocks/connections.ts` | `src/modules/store/mocks/connections.ts` |
| `src/features/store-connect/index.ts` | deleted |

### `src/features/shopping-agent/` → `src/modules/shopping-agent/`

| Current | New |
|---|---|
| `src/features/shopping-agent/components/chat-interface.tsx` | `src/modules/shopping-agent/components/chat-interface.tsx` |
| `src/features/shopping-agent/components/chat-message.tsx` | `src/modules/shopping-agent/components/chat-message.tsx` |
| `src/features/shopping-agent/components/product-recommendation-card.tsx` | `src/modules/shopping-agent/components/product-recommendation-card.tsx` |
| `src/features/shopping-agent/hooks/use-shopping-agent.ts` | `src/modules/shopping-agent/hooks/use-shopping-agent.ts` |
| `src/features/shopping-agent/mocks/responses.ts` | `src/modules/shopping-agent/mocks/responses.ts` |
| `src/features/shopping-agent/index.ts` | deleted |

### `src/features/wearable-agent/` → `src/modules/wearable-agent/`

| Current | New |
|---|---|
| `src/features/wearable-agent/components/*.tsx` (all 11 files) | `src/modules/wearable-agent/components/` |
| `src/features/wearable-agent/hooks/use-try-on.ts` | `src/modules/wearable-agent/hooks/use-try-on.ts` |
| `src/features/wearable-agent/hooks/use-try-on-agent.ts` | `src/modules/wearable-agent/hooks/use-try-on-agent.ts` |
| `src/features/wearable-agent/mocks/products.ts` | `src/modules/wearable-agent/mocks/products.ts` |
| `src/features/wearable-agent/mocks/responses.ts` | `src/modules/wearable-agent/mocks/responses.ts` |
| `src/features/wearable-agent/index.ts` | deleted |

### `src/domain/` → absorbed into modules

| Current | New |
|---|---|
| `src/domain/workspaces/types.ts` | `src/modules/workspaces/types.ts` |
| `src/domain/workspaces/constants.ts` | `src/modules/workspaces/constants.ts` |
| `src/domain/store/types.ts` | `src/modules/store/types.ts` |
| `src/domain/store/constants.ts` | `src/modules/store/constants.ts` |
| `src/domain/products/types.ts` | `src/modules/shopping-agent/types.ts` (shared via import) |
| `src/domain/products/constants.ts` | `src/modules/shopping-agent/constants.ts` |
| `src/domain/agents/types.ts` | split: wearable types → `modules/wearable-agent/types.ts`, shared chat types → `modules/shopping-agent/types.ts` |
| `src/domain/agents/constants.ts` | `src/modules/shopping-agent/constants.ts` |

---

## New Files to Create: `src/lib/db/`

These extract raw Supabase queries out of API routes into reusable functions:

### `src/lib/db/workspaces.ts`
```typescript
export async function getWorkspacesByOwner(ownerId: string)
export async function getWorkspaceById(id: string, ownerId: string)
export async function createWorkspace(data: CreateWorkspaceInput)
export async function updateWorkspace(id: string, ownerId: string, patch: UpdateWorkspaceInput)
export async function deleteWorkspace(id: string, ownerId: string)
export async function countWorkspacesByOwner(ownerId: string)
```

### `src/lib/db/users.ts`
```typescript
export async function getUserById(id: string)
export async function getUserByEmail(email: string)
export async function createUser(data: CreateUserInput)
export async function updateUser(id: string, patch: Partial<UserRow>)
export async function setPasswordHash(userId: string, hash: string)
export async function completeOnboarding(userId: string, data: OnboardingData)
```

### `src/lib/db/sessions.ts`
```typescript
export async function createSession(userId: string, userAgent: string, ip: string)
export async function getSessionsByUser(userId: string)
export async function deleteSession(sid: string, userId: string)
export async function deleteAllOtherSessions(currentSid: string, userId: string)
```

### `src/lib/db/notifications.ts`
```typescript
export async function getNotificationPrefs(userId: string)
export async function upsertNotificationPrefs(userId: string, prefs: NotificationPrefs)
```

---

## LLM Agent Streaming Architecture (New API Routes)

When building real agent endpoints, use Next.js streaming route handlers:

```typescript
// src/app/api/agents/shopping/route.ts
export async function POST(req: Request) {
  const { message, workspaceId, history } = await req.json();
  const user = await getCurrentUser();

  const stream = new ReadableStream({
    async start(controller) {
      // Call OpenAI / Anthropic with streaming
      for await (const chunk of llmStream) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

Client side consumes with `fetch` + `ReadableStream` reader — no WebSockets needed for conversational agents.

---

## Future Worker Service (Trigger.dev) — Add When Needed

Only add this when you have a job that exceeds 60 seconds (e.g. indexing a full product catalog):

```
# Install when ready
pnpm add @trigger.dev/sdk @trigger.dev/nextjs
```

```
src/
└── trigger/                          ← Job definitions (same repo, same types)
    ├── catalog-index.ts              ← Index store products into vector DB
    ├── store-sync.ts                 ← Sync products when store connects
    └── batch-description.ts          ← Generate AI descriptions for all products
```

Jobs are triggered from API routes:
```typescript
import { catalogIndex } from "@/trigger/catalog-index";
await catalogIndex.trigger({ storeId, workspaceId });
```

**Do NOT add this until you actually have a job that times out.**

---

## Implementation Order

| Step | Task | Complexity |
|---|---|---|
| 1 | Create `src/lib/db/` query layer (4 files) | Low — extract existing queries |
| 2 | Create `src/modules/` and move all `src/features/` files | Medium — file moves + import updates |
| 3 | Move `src/lib/auth/` into `src/modules/auth/lib/` | Medium — many files import from here |
| 4 | Move `src/lib/store/workspace-store.ts` into `src/modules/workspaces/store.ts` | Low |
| 5 | Move `src/domain/` types into their respective modules | Low |
| 6 | Move `src/components/providers/` into `src/modules/workspaces/providers/` | Low |
| 7 | Update `tsconfig.json` path aliases if needed | Low |
| 8 | Delete `src/features/`, `src/domain/`, `src/lib/auth/`, `src/lib/store/` | Cleanup |
| 9 | Run `pnpm lint && pnpm build` to verify zero errors | Verification |

**Total estimate:** All steps in one session, largest risk is Step 3 (auth imports are used everywhere).

---

## `tsconfig.json` Path Aliases (After Restructure)

The `@/` alias stays pointing to `src/` — no change needed. Only the import paths inside files change:

```typescript
// Before
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { getCurrentUser } from "@/lib/auth/get-user";
import { WorkspaceList } from "@/features/workspaces";

// After
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { WorkspaceList } from "@/modules/workspaces/components/workspace-list";
```
