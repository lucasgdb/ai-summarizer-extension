# ai-summarizer

Chromium extension (MV3) that summarizes the part of a page you pick.

## Stack

WXT · React 19 (+ React Compiler) · TypeScript 7 · Tailwind CSS 4 · shadcn/ui (radix-nova) · TanStack Query + Virtual · TanStack Markdown · Biome

## Setup

```bash
cp .env.example .env   # WXT_API_URL and WXT_GOOGLE_CLIENT_ID
pnpm install
```

### Google sign-in

1. Google Cloud → APIs & Services → Credentials → **Create OAuth client ID**, type **Web application**.
2. Authorized redirect URI: `https://dndfpaedmpflakhaeiejjkmjmijfpnon.chromiumapp.org/`. The `key` in `wxt.config.ts` pins this extension id for every unpacked install.
3. Put the client id in `WXT_GOOGLE_CLIENT_ID` here and in `GOOGLE_CLIENT_IDS` in the API's `.env`.

The panel opens Google's account chooser with `identity.launchWebAuthFlow` (`response_type=id_token` plus a nonce) and trades the ID token at `POST /auth/google` for an API session. The session is kept in `chrome.storage.local`, refreshed with `GET /me` when the panel opens, and dropped on any `401`.

Changing `.env` needs a rebuild and an extension reload (the API origin is baked into the manifest).

## Scripts

```bash
pnpm dev        # opens Chrome with the extension loaded and HMR
pnpm build      # .output/chrome-mv3
pnpm zip        # Chrome Web Store zip (mode "store", see below)
pnpm typecheck
pnpm lint       # pnpm lint:fix to apply fixes
```

To load a build by hand: `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`.

## How it works

- Clicking the toolbar icon opens the **side panel** (a popup would close on the first click on the page, killing the picker).
- `src/entrypoints/page-bridge.ts` is injected on demand with `scripting.executeScript`. It never runs on pages the user didn't point it at.
- **Select content** opens a devtools-style picker (↑ parent, ↓ child, Enter/click to select, Esc to cancel). A port between the panel and the page keeps the session alive, and closing the panel removes the picker.
- Permissions: `activeTab`, `scripting`, `sidePanel`, `storage`, `identity`. Host access (`<all_urls>`) is optional and only requested if the user clicks **Allow access**.
- `src/lib/summaries.ts` talks to `/summaries` on [ai-summarizer-api](../ai-summarizer-api): create (in the UI language, `en`/`pt`), history list, detail and delete. The API origin is the extension's only `host_permissions` entry, so requests skip CORS and the API doesn't need the extension id.
- **History** (`src/components/history`): `useInfiniteQuery` over the cursor-paginated `GET /summaries`, rendered by `InfiniteList` (`useWindowVirtualizer`; the next page loads when its placeholder row scrolls into view). `InfiniteList` opts out of the React Compiler (`"use no memo"`) because TanStack Virtual isn't compatible with it. Query keys are scoped by user, and the cache is cleared on sign-out.
- **Credits**: picking content quotes its price (`POST /summaries/quote`), shown on the button ("Summarize · 2 credits"). The summary is sent with `expected_credits` set to that quote, so the user is never charged anything else. A `409` (price changed) or `402` (not enough credits) charges nothing and updates the button. Balance comes from `GET /credits`, and the account menu opens the credits page with the statement (`GET /credits/transactions`, same `InfiniteList`).
- **Options** (`src/components/generation-options.tsx`): model, style, length, effort and free-text preferences, built from `GET /summaries/options`. Models come from the API's database, and the labels for styles, lengths and efforts live in `i18n.ts`. The last choices are kept in `chrome.storage.local` (`src/lib/preferences.ts`); saved values the API no longer offers fall back to its defaults. Every change re-quotes (preferences are debounced), and the summary is sent with exactly the quoted options.
- **Streaming**: Summarize jumps straight to the summary screen and reads `POST /summaries` as server-sent events (`Accept: text/event-stream`, parsed in `src/lib/sse.ts`). `start` updates the balance, `title` fills the heading, and each `delta` is appended to the Markdown, re-rendered at most once per animation frame with TanStack Markdown's streaming extension. `done` swaps in the saved summary. The API finishes and charges a summary even if the client leaves, so going back mid-stream only detaches the UI and the result still lands in the history. Closing the panel stops reading. A stream that goes silent for 45 s (the API pings every 15 s) counts as dropped.
- **Translations** (`src/components/translatable-summary.tsx`): a saved summary (in the history, or right after summarizing) offers "Translate to …" for each language the API supports that it lacks, priced with `POST /summaries/{id}/translate/quote`. The translation streams in like a summary (same SSE events, shared `streamPost`), at exactly the quoted price. "Original · Português" chips switch between versions. Opening a saved translation sends `expected_credits: 0`, so a translation that doesn't exist answers `409` instead of being charged.
- **Start screen**: a card describes the active tab before any action (title, site, description, word count, reading time, language). The tab's icon comes from Chrome's cache (`favicon` permission, no request to the site).
- **PDFs** (`src/lib/pdf.ts`): a PDF tab gets a single "Read PDF" action. The page script downloads the file from inside the tab (same origin, so the site's cookies apply), and pdf.js (`pdfjs-dist`, loaded only when needed) extracts the text page by page, with a progress bar. The user then summarizes all pages or a single one, switching without reading the file again. The worker is bundled, and the CMaps for CID fonts are copied from the package at build time (`build:publicAssets` hook). Password-protected, scanned (no text), oversized (over 30 MB) and local files with file access off get their own messages.
- Summaries are Markdown (`content`), rendered with `@tanstack/markdown/react`: raw HTML off, images reduced to their alt text, executable link protocols stripped, links open in a new tab.
- UI strings live in typed dictionaries in `src/lib/i18n.ts` (English by default, Portuguese via the EN/PT switch). The choice is kept in `chrome.storage.local`, so the panel and the page picker share it and update live. `public/_locales` only holds the manifest/store texts.

## UI components

shadcn/ui lives in `src/components/ui` (generated, lint disabled there). Add more with:

```bash
pnpm shadcn add <component>
```

## Publishing

`pnpm zip` builds in mode `store` and writes `.output/ai-summarizer-<version>-chrome-store.zip`:

- **Environment:** `.env.store` is loaded on top of `.env`, with the production `WXT_API_URL` and `WXT_GOOGLE_CLIENT_ID`. Variables are baked into the build (`import.meta.env`, and the API origin into `host_permissions`); there's no `.env` at runtime, so changing one means a new zip.
- **No `key`:** the Web Store assigns the extension id. The `key` in `wxt.config.ts` only pins the id for unpacked installs, so local builds keep it.
- **Mock data stays out:** the credit plans (`src/lib/plans.ts`) are hidden in the store build until the API serves them.

Google sign-in needs the store id's redirect URI (`https://<store-id>.chromiumapp.org/`) in the OAuth client, and the client id in the API's `GOOGLE_CLIENT_IDS`.
