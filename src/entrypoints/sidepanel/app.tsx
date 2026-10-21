import {
  ArrowUpRightIcon,
  BanIcon,
  FileTextIcon,
  FileWarningIcon,
  KeyRoundIcon,
  SquareDashedMousePointerIcon,
  TextSearchIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import { Suspense, useEffect, useEffectEvent, useRef, useState } from "react";
import { browser } from "#imports";
import { AccountMenu } from "@/components/account-menu";
import { BackButton } from "@/components/back-button";
import { FillSection } from "@/components/fill/fill-section";
import { emptyFilter, type FilterState } from "@/components/history/filters";
import { LanguageSwitch } from "@/components/language-switch";
import {
  BuyCredits,
  BuyCreditsFallback,
  CreditsFallback,
  CreditsPage,
  FormFallback,
  History,
  HistoryFallback,
  preloadSections,
  SummarizeForm,
} from "@/components/lazy-sections";
import { ModeSwitch } from "@/components/mode-switch";
import { Notice } from "@/components/notice";
import { PageCard } from "@/components/page-card";
import { PickingHint } from "@/components/picking-hint";
import { Selection } from "@/components/selection";
import { SignIn } from "@/components/sign-in";
import { type SummaryShape, SummaryView } from "@/components/summary-view";
import { TextSkeleton } from "@/components/text-skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { TranslatableSummary } from "@/components/translatable-summary";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { apiUrl } from "@/lib/api";
import { refreshUser, type Session } from "@/lib/auth";
import { keyCommands } from "@/lib/bridge/picker";
import { BuyCreditsContext } from "@/lib/buy-credits";
import { formatNumber, getDictionary, localeConfig } from "@/lib/i18n";
import type { PickedContent, PickerCommand } from "@/lib/messages";
import {
  detectPdf,
  inspectPage,
  PageError,
  type PageErrorReason,
  type PageInfo,
  type PdfPages,
  pdfContent,
  pickElement,
  readPage,
  readPdf,
  requestAccess,
} from "@/lib/page";
import type { PdfDocument } from "@/lib/pdf";
import { portfolioPage } from "@/lib/portfolio";
import {
  queryClient,
  refreshAfterFailure,
  refundBalance,
  rememberSummary,
  setBalance,
  setQuotePrice,
} from "@/lib/queries";
import {
  type Generation,
  type HistoryItem,
  SummaryError,
  type SummaryErrorReason,
  type SummaryRecord,
  streamSummary,
} from "@/lib/summaries";
import { syncThemeAcrossPages } from "@/lib/theme";
import {
  continueInPanel,
  type PanelIntent,
  watchPanelIntents,
} from "@/lib/ui-mode";
import { useUiMode } from "@/lib/ui-mode-context";
import { useDictionary, useLocale } from "@/lib/use-locale";
import { useSession } from "@/lib/use-session";
import { cn } from "@/lib/utils";

type Source = "element" | "page" | "pdf";

// "buy" isn't in the nav: it opens from the credits (and wherever they run short)
type Section = "summarize" | "fill" | "history" | "credits" | "buy";
const navSections = [
  "summarize",
  "fill",
  "history",
  "credits",
] as const satisfies Section[];

// Signed out, or back to the price on the button, instead of an error screen
type ShownSummaryError = Exclude<
  SummaryErrorReason,
  "unauthorized" | "insufficient" | "price-changed" | "incomplete"
>;

type State =
  | { status: "idle" }
  | { status: "picking" }
  | { status: "reading" }
  | { status: "reading-pdf"; progress?: { page: number; total: number } }
  | {
      status: "selected";
      content: PickedContent;
      priceChanged?: boolean;
      /** A PDF keeps every page, so the choice can change without re-reading */
      pdf?: { document: PdfDocument; pages: PdfPages };
    }
  /** Charged and being written: the text shows up as the model writes it */
  | { status: "streaming"; content: PickedContent; draft: SummaryShape }
  | { status: "summarized"; content: PickedContent; summary: SummaryRecord }
  /** Failed after the text started: charged, not saved, the partial text kept */
  | {
      status: "summary-incomplete";
      content: PickedContent;
      draft: SummaryShape;
    }
  | {
      status: "summary-failed";
      content: PickedContent;
      reason: ShownSummaryError;
      /** The price and options it was attempted with, for "Try again" */
      credits: number;
      generation: Generation;
      /** The API's message for a 400 */
      detail?: string;
    }
  | { status: "error"; reason: PageErrorReason | "unknown"; source: Source };

const version = browser.runtime.getManifest().version;

export function App() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const session = useSession();
  const userId = session?.user.id;
  const [section, setSection] = useState<Section>("summarize");
  // Where "Buy credits" was opened from, to go back there
  const [buyFrom, setBuyFrom] = useState<Section>("credits");
  const [openSummary, setOpenSummary] = useState<HistoryItem | null>(null);
  const [historyFilter, setHistoryFilter] = useState<FilterState>(emptyFilter);
  // A pick the popup handed over (it closes on the first click on the page)
  const [handedPick, setHandedPick] = useState<{
    intent: PanelIntent;
    n: number;
  } | null>(null);
  const mode = useUiMode();

  useEffect(() => {
    document.documentElement.lang = localeConfig[locale].htmlLang;
  }, [locale]);

  // Sections split off the first bundle: fetch them once the panel is idle
  useEffect(preloadSections, []);
  // Here, not in the theme button: signed in, that button lives in a menu
  useEffect(syncThemeAcrossPages, []);

  // Every account starts on "summarize"; signing out forgets its cached data
  useEffect(() => {
    setSection("summarize");
    setOpenSummary(null);
    setHistoryFilter(emptyFilter);
    if (!userId) queryClient.clear();
  }, [userId]);

  // In the side panel: the pick the popup asked for, in its section
  useEffect(() => {
    if (mode !== "sidepanel") return;
    return watchPanelIntents((intent) => {
      setSection(intent === "pick-form" ? "fill" : "summarize");
      setOpenSummary(null);
      setHandedPick((last) => ({ intent, n: (last?.n ?? 0) + 1 }));
    });
  }, [mode]);

  function navigate(next: Section) {
    setSection(next);
    setOpenSummary(null);
    window.scrollTo(0, 0);
  }

  // Keeps the open summary: back from buying returns to it
  function openBuy() {
    if (section !== "buy") setBuyFrom(section);
    setSection("buy");
    window.scrollTo(0, 0);
  }

  function closeBuy() {
    setSection(buyFrom);
    window.scrollTo(0, 0);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="site-header sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <div className="flex h-12 items-center justify-between px-4">
          {session ? (
            <MainNav section={section} onNavigate={navigate} />
          ) : (
            <span className="font-semibold tracking-tighter">{dict.brand}</span>
          )}
          {/* Signed in, language and theme are always in the account menu, and
              also here when there's room. Signed out, the last control is a
              ghost icon: -mr lines its glyph up with the gutter (the pill's
              border does that itself) */}
          {session ? (
            <div className="flex items-center gap-1">
              {/* Only when the panel is wide enough (~540px for four links,
                  "preencher formulários" the longest, these two and the
                  pill): narrower, they'd crowd the row, and the account menu
                  has them anyway, at any width */}
              <div className="hidden items-center gap-1 min-[34rem]:flex">
                <LanguageSwitch />
                <ThemeToggle />
              </div>
              <AccountMenu
                session={session}
                onOpenCredits={() => navigate("credits")}
                onBuyCredits={openBuy}
              />
            </div>
          ) : (
            <div className="-mr-1.5 flex items-center gap-1">
              <LanguageSwitch />
              <ThemeToggle />
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 pt-6 pb-10">
        {session ? (
          <BuyCreditsContext value={openBuy}>
            {/* Hidden, not unmounted: a pick or summary in progress survives
                a look at the history */}
            <div
              className={
                section === "summarize" ? "flex flex-1 flex-col" : "hidden"
              }
            >
              {/* Keyed by user: signing in as someone else starts from scratch */}
              <Summarizer
                key={session.user.id}
                session={session}
                handedPick={
                  handedPick?.intent === "pick-content" ? handedPick.n : 0
                }
              />
            </div>
            {/* Same: a form picked and half answered survives a look elsewhere */}
            <div
              className={section === "fill" ? "flex flex-1 flex-col" : "hidden"}
            >
              <FillSection
                key={session.user.id}
                session={session}
                handedPick={
                  handedPick?.intent === "pick-form" ? handedPick.n : 0
                }
              />
            </div>
            {section === "credits" && (
              <Suspense fallback={<CreditsFallback />}>
                <CreditsPage session={session} onBuy={openBuy} />
              </Suspense>
            )}
            {section === "buy" && (
              <Suspense fallback={<BuyCreditsFallback onBack={closeBuy} />}>
                <BuyCredits
                  key={session.user.id}
                  session={session}
                  onBack={closeBuy}
                />
              </Suspense>
            )}
            {section === "history" && (
              <div className="flex flex-1 flex-col">
                <Suspense fallback={<HistoryFallback />}>
                  <History
                    key={session.user.id}
                    session={session}
                    open={openSummary}
                    onOpenChange={setOpenSummary}
                    filter={historyFilter}
                    onFilterChange={setHistoryFilter}
                  />
                </Suspense>
              </div>
            )}
          </BuyCreditsContext>
        ) : (
          <SignIn />
        )}
      </main>

      <footer className="flex items-center justify-between px-4 pb-6 text-sm text-muted-foreground">
        <a
          className="flex items-center gap-1.5 transition-colors hover:text-foreground"
          // The site in the same language as the panel
          href={portfolioPage("/", locale)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ArrowUpRightIcon className="size-3.5" />
          lucasbittencourt.dev
        </a>
        <div className="-mr-1.5 flex items-center gap-2">
          <span className="tabular-nums">v{version}</span>
          <ModeSwitch />
        </div>
      </footer>
    </div>
  );
}

/** The short label below ~430px (the popup is 400px), when there is one */
function NavLabel({ full, short }: { full: string; short?: string }) {
  if (!short || short === full) return full;
  return (
    <>
      <span className="min-[27rem]:hidden">{short}</span>
      <span className="hidden min-[27rem]:inline">{full}</span>
    </>
  );
}

// Lowercase text links, like lucasbittencourt.dev's nav
function MainNav({
  section,
  onNavigate,
}: {
  section: Section;
  onNavigate: (section: Section) => void;
}) {
  const dict = useDictionary();
  // Buying is part of the credits
  const current = section === "buy" ? "credits" : section;

  return (
    <nav aria-label={dict.nav.label} className="-ml-1.5 flex">
      {navSections.map((item) => (
        <button
          key={item}
          type="button"
          aria-current={current === item ? "page" : undefined}
          onClick={() => onNavigate(item)}
          className={cn(
            "cursor-pointer whitespace-nowrap rounded-md px-1.5 py-1 tracking-tight transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            current === item ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <NavLabel full={dict.nav[item]} short={dict.nav.short[item]} />
        </button>
      ))}
    </nav>
  );
}

function Summarizer({
  session,
  handedPick,
}: {
  session: Session;
  /** Counts the picks handed over by the popup: each new one starts one */
  handedPick: number;
}) {
  const locale = useLocale();
  const mode = useUiMode();
  const [state, setState] = useState<State>({ status: "idle" });
  // One job at a time: picking, reading or summarizing
  const job = useRef<AbortController | null>(null);
  const sendToPicker = useRef<((command: PickerCommand) => void) | null>(null);

  function startJob() {
    job.current?.abort();
    job.current = new AbortController();
    return job.current.signal;
  }

  // A pick the popup handed over: started once the side panel has it
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per hand-off
  useEffect(() => {
    if (handedPick) void capture("element");
  }, [handedPick]);

  function reset() {
    job.current?.abort();
    job.current = null;
    setState({ status: "idle" });
  }

  async function capturePdf() {
    const signal = startJob();
    setState({ status: "reading-pdf" });
    try {
      const document = await readPdf((page, total) => {
        if (!signal.aborted) {
          setState({ status: "reading-pdf", progress: { page, total } });
        }
      }, signal);
      if (signal.aborted) return;
      setState({
        status: "selected",
        content: pdfContent(document, "all"),
        pdf: { document, pages: "all" },
      });
    } catch (error) {
      if (signal.aborted) return;
      console.error(error);
      const reason = error instanceof PageError ? error.reason : "unknown";
      setState({ status: "error", reason, source: "pdf" });
    }
  }

  function choosePdfPages(pages: PdfPages) {
    if (state.status !== "selected" || !state.pdf) return;
    const { document } = state.pdf;
    setState({
      status: "selected",
      content: pdfContent(document, pages),
      pdf: { document, pages },
    });
  }

  async function capture(source: Source) {
    // The popup would close on the first click on the page: the side panel
    // picks instead (opened here, while this is still the click)
    if (source === "element" && mode === "popup") {
      void continueInPanel("pick-content");
      return;
    }
    // A PDF the URL didn't give away ("whole page" on a viewer tab) reads as one
    if (source === "pdf" || (source === "page" && (await detectPdf()))) {
      await capturePdf();
      return;
    }
    const signal = startJob();
    setState({ status: source === "element" ? "picking" : "reading" });
    try {
      const content =
        source === "element"
          ? await pickElement(signal, (send) => {
              sendToPicker.current = send;
            })
          : await readPage();
      if (signal.aborted) return;
      setState(content ? { status: "selected", content } : { status: "idle" });
    } catch (error) {
      if (signal.aborted) return;
      console.error(error);
      const reason = error instanceof PageError ? error.reason : "unknown";
      setState({ status: "error", reason, source });
    } finally {
      sendToPicker.current = null;
    }
  }

  function command(command: PickerCommand) {
    if (command === "cancel") {
      reset();
    } else {
      sendToPicker.current?.(command);
    }
  }

  const onPanelKey = useEffectEvent((event: KeyboardEvent) => {
    const key = keyCommands[event.key];
    if (!key) return;
    event.preventDefault();
    command(key);
  });

  // Focus stays here after "Select content", so the page never sees the keys
  useEffect(() => {
    if (state.status !== "picking") return;
    window.addEventListener("keydown", onPanelKey);
    return () => window.removeEventListener("keydown", onPanelKey);
  }, [state.status]);

  async function grantAndRetry(source: Source) {
    if (await requestAccess()) {
      onTabChange();
      await capture(source);
    }
  }

  async function runSummary(
    content: PickedContent,
    expectedCredits: number,
    generation: Generation,
  ) {
    // Aborted when the user leaves this screen. The stream itself keeps going:
    // the API finishes (and charges) it regardless, so it lands in the history
    const signal = startJob();
    let draft: SummaryShape = {
      title: "",
      content: "",
      source_url: content.url || null,
      source_title: content.title || null,
      // Known once it's saved: the API picks the model
      model: "",
      effort: generation.effort ?? "",
      credits: 0,
      created_at: new Date().toISOString(),
    };
    setState({ status: "streaming", content, draft });
    window.scrollTo(0, 0);

    // What onStart charged, to put back on the balance if it's refunded
    let charged = 0;
    // Deltas arrive faster than it's worth re-rendering: one paint per frame
    let frame = 0;
    const update = (change: Partial<SummaryShape>) => {
      draft = { ...draft, ...change };
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        if (!signal.aborted) setState({ status: "streaming", content, draft });
      });
    };

    try {
      const summary = await streamSummary(
        content,
        locale,
        generation,
        expectedCredits,
        session.token,
        {
          onStart: (charge) => {
            charged = charge.credits;
            setBalance(session, charge.credit_balance);
            update({ credits: charge.credits });
          },
          onTitle: (title) => update({ title }),
          onPreview: () => {},
          onDelta: (text) => update({ content: draft.content + text }),
        },
        lifetime.current?.signal ?? new AbortController().signal,
      );
      cancelAnimationFrame(frame);
      // Saved by the API either way: show it in the history even if dismissed
      rememberSummary(session, summary);
      if (!signal.aborted) setState({ status: "summarized", content, summary });
    } catch (error) {
      cancelAnimationFrame(frame);
      const reason =
        error instanceof SummaryError ? error.reason : "unavailable";
      // Returned by the API: on the balance right away, then confirmed
      if (error instanceof SummaryError && error.refunded) {
        refundBalance(session, charged);
      }
      if (
        reason === "unavailable" ||
        reason === "timeout" ||
        reason === "interrupted" ||
        reason === "incomplete"
      ) {
        refreshAfterFailure(session, { history: reason === "interrupted" });
      }
      if (signal.aborted) return;
      // Charged and not saved: the text that arrived is all there is
      if (reason === "incomplete") {
        setState({
          status: "summary-incomplete",
          content,
          // No title comes before the text ends: the page's stands in
          draft: { ...draft, title: draft.title || content.title },
        });
        return;
      }
      console.error(error);
      // Keeps the selection, so "Try again" doesn't mean picking again
      if (reason === "unauthorized") {
        // Expired or revoked: already dropped, back to the sign-in screen
        return;
      }
      // Nothing was charged: show the real price/balance on the button again
      if (reason === "insufficient" || reason === "price-changed") {
        const credits =
          error instanceof SummaryError ? error.credits : undefined;
        if (credits) {
          setQuotePrice(session, content, locale, generation, credits.price);
          if (credits.balance !== undefined) {
            setBalance(session, credits.balance);
          }
        }
        setState({
          status: "selected",
          content,
          priceChanged: reason === "price-changed",
        });
        return;
      }
      setState({
        status: "summary-failed",
        content,
        reason,
        credits: expectedCredits,
        generation,
        detail: error instanceof SummaryError ? error.detail : undefined,
      });
    }
  }

  // Closing the panel (unmount) is the only thing that stops reading a stream
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  // Fresh name/picture, and signs out if the API revoked the session
  const onOpen = useEffectEvent(() => refreshUser(session));
  useEffect(() => {
    onOpen();
  }, []);

  // A selection belongs to one page: drop it when the user switches tabs or
  // navigates. Closing the panel tears down the picker on its own.
  const onPageChange = useEffectEvent(reset);

  // The start screen describes the tab; a PDF gets its own (one "Read PDF").
  // undefined while reading it, null without access
  const [page, setPage] = useState<PageInfo | null | undefined>(undefined);
  const onTabChange = useEffectEvent(() => {
    setPage(undefined);
    inspectPage().then(setPage);
  });

  useEffect(() => {
    let windowId: number | undefined;
    browser.windows.getCurrent().then((window) => {
      windowId = window.id;
    });

    function onActivated(info: { windowId: number }) {
      if (info.windowId !== windowId) return;
      onPageChange();
      onTabChange();
    }
    function onUpdated(
      _tabId: number,
      change: { status?: string },
      tab: { active: boolean; windowId: number },
    ) {
      if (!tab.active || tab.windowId !== windowId) return;
      if (change.status === "loading") onPageChange();
      // Loaded: only now can the page say what it is
      if (change.status === "complete") onTabChange();
    }

    onTabChange();
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      job.current?.abort();
    };
  }, []);

  return (
    <Content
      state={state}
      onCapture={capture}
      onGrant={grantAndRetry}
      session={session}
      onSummarize={runSummary}
      onReset={reset}
      onReselect={(content) => setState({ status: "selected", content })}
      page={page}
      onPdfPages={choosePdfPages}
    />
  );
}

type ContentProps = {
  state: State;
  onCapture: (source: Source) => void;
  onGrant: (source: Source) => void;
  session: Session;
  onSummarize: (
    content: PickedContent,
    expectedCredits: number,
    generation: Generation,
  ) => void;
  onReset: () => void;
  /** Back to the same content, to summarize it again */
  onReselect: (content: PickedContent) => void;
  page: PageInfo | null | undefined;
  onPdfPages: (pages: PdfPages) => void;
};

function Content({
  state,
  onCapture,
  onGrant,
  session,
  onSummarize,
  onReset,
  onReselect,
  page,
  onPdfPages,
}: ContentProps) {
  const dict = useDictionary();

  switch (state.status) {
    case "idle":
    case "reading":
      // A PDF has no elements to pick and no "page" around the text
      if (page?.pdf) {
        return (
          <section>
            <h1 className="title mb-4 text-2xl font-semibold tracking-tighter">
              {dict.heroTitle}
            </h1>
            <p className="mb-6 text-muted-foreground">{dict.pdf.body}</p>
            <div className="mb-6">
              <PageCard info={page} />
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={() => onCapture("pdf")}
            >
              <FileTextIcon data-icon="inline-start" />
              {dict.pdf.read}
            </Button>
          </section>
        );
      }
      return (
        <section>
          <h1 className="title mb-4 text-2xl font-semibold tracking-tighter">
            {dict.heroTitle}
          </h1>
          <p className="mb-6 text-muted-foreground">{dict.heroBody}</p>
          {page !== null && (
            <div className="mb-6">
              <PageCard info={page} />
            </div>
          )}
          {/* Disabled until the tab is known: it may turn out to be a PDF,
              which gets its own action instead of these two */}
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              disabled={page === undefined}
              onClick={() => onCapture("element")}
            >
              <SquareDashedMousePointerIcon data-icon="inline-start" />
              {dict.selectContent}
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={page === undefined || state.status === "reading"}
              onClick={() => onCapture("page")}
            >
              <FileTextIcon data-icon="inline-start" />
              {dict.wholePage}
            </Button>
          </div>
        </section>
      );

    case "reading-pdf":
      return (
        <div className="space-y-5">
          <BackButton onClick={onReset}>{dict.back}</BackButton>
          <ReadingPdf progress={state.progress} />
        </div>
      );

    // "← Back" cancels the picker on the page, like Esc
    case "picking":
      return (
        <div className="space-y-5">
          <BackButton onClick={onReset}>{dict.back}</BackButton>
          <PickingHint />
        </div>
      );

    // The summary takes the whole screen: its header already links the page.
    // Going back mid-stream doesn't cancel it; it finishes into the history
    case "streaming":
      return (
        <div className="space-y-5">
          <BackButton onClick={onReset}>{dict.back}</BackButton>
          <SummaryView summary={state.draft} streaming />
        </div>
      );

    case "summary-incomplete":
      return (
        <div className="space-y-5">
          <BackButton onClick={onReset}>{dict.back}</BackButton>
          <Notice
            icon={TriangleAlertIcon}
            title={dict.summaryIncomplete.title}
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReselect(state.content)}
              >
                {dict.summaryIncomplete.backToSelection}
              </Button>
            }
          >
            {dict.summaryIncomplete.body}
          </Notice>
          <SummaryView summary={state.draft} />
        </div>
      );

    case "summarized":
      return (
        <div className="space-y-5">
          <BackButton onClick={onReset}>{dict.back}</BackButton>
          <TranslatableSummary session={session} summary={state.summary} />
        </div>
      );

    case "selected":
    case "summary-failed": {
      const { content } = state;
      return (
        <div className="space-y-5">
          {/* Same "← Back" as the summary screen, instead of a Clear button */}
          <BackButton onClick={onReset}>{dict.back}</BackButton>
          <div className="space-y-6">
            <Selection
              content={content}
              pdf={
                state.status === "selected" && state.pdf
                  ? {
                      pageCount: state.pdf.document.pages.length,
                      pages: state.pdf.pages,
                      onChange: onPdfPages,
                    }
                  : undefined
              }
            />
            {/* A blank page of a PDF: nothing to send (the API would refuse it) */}
            {state.status === "selected" && !content.text && (
              <p className="text-sm text-muted-foreground">
                {dict.pdf.emptyPage}
              </p>
            )}
            {state.status === "selected" && content.text && (
              <Suspense fallback={<FormFallback />}>
                <SummarizeForm
                  session={session}
                  content={content}
                  priceChanged={state.priceChanged ?? false}
                  onSummarize={(credits, generation) =>
                    onSummarize(content, credits, generation)
                  }
                  onReselect={
                    // The whole page or a PDF would just read the same again
                    content.source === "element"
                      ? () => onCapture("element")
                      : undefined
                  }
                />
              </Suspense>
            )}
            {state.status === "summary-failed" && <Separator />}
            {state.status === "summary-failed" && (
              <SummaryFailed
                reason={state.reason}
                detail={state.detail}
                onRetry={() =>
                  onSummarize(content, state.credits, state.generation)
                }
              />
            )}
          </div>
        </div>
      );
    }

    case "error":
      return (
        <ErrorNotice
          state={state}
          onCapture={onCapture}
          onGrant={onGrant}
          onReset={onReset}
        />
      );
  }
}

function SummaryFailed({
  reason,
  detail,
  onRetry,
}: {
  reason: ShownSummaryError;
  detail?: string;
  onRetry: () => void;
}) {
  const dict = useDictionary();
  const { title, body } = dict.summaryErrors[reason];

  return (
    <Notice
      variant="destructive"
      icon={reason === "offline" ? WifiOffIcon : TriangleAlertIcon}
      title={title}
      actions={
        // A dropped stream may still finish: retrying could pay twice.
        // Leaving is the "← Back" at the top of the screen
        reason !== "interrupted" && (
          <Button onClick={onRetry}>{dict.tryAgain}</Button>
        )
      }
    >
      {typeof body === "function" ? body(apiUrl) : body}
      {/* A 400 explains itself ("unknown model", ...) */}
      {reason === "invalid" && detail && ` (${detail})`}
      {/* The API refunds a charge when the model fails or times out */}
      {(reason === "unavailable" || reason === "timeout") &&
        ` ${dict.credits.refunded}`}
    </Notice>
  );
}

const pdfErrorKeys = {
  "file-access": "fileAccess",
  "pdf-protected": "pdfProtected",
  "pdf-invalid": "pdfInvalid",
  "pdf-no-text": "pdfNoText",
  "pdf-too-large": "pdfTooLarge",
  "pdf-unreadable": "pdfUnreadable",
} as const;

function ReadingPdf({
  progress,
}: {
  progress?: { page: number; total: number };
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);

  return (
    <section className="space-y-3" aria-busy="true">
      <p className="flex items-center gap-2 font-medium tracking-tight">
        <Spinner aria-hidden="true" />
        {dict.pdf.reading}
      </p>
      <div className="space-y-1.5">
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{
              width: progress
                ? `${(progress.page / progress.total) * 100}%`
                : "0%",
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {progress ? (
            dict.pdf.progress(
              formatNumber(locale, progress.page),
              formatNumber(locale, progress.total),
            )
          ) : (
            <TextSkeleton className="w-24" />
          )}
        </p>
      </div>
    </section>
  );
}

function ErrorNotice({
  state,
  onCapture,
  onGrant,
  onReset,
}: Omit<
  ContentProps,
  "state" | "session" | "onSummarize" | "page" | "onPdfPages" | "onReselect"
> & {
  state: Extract<State, { status: "error" }>;
}) {
  const dict = useDictionary();
  const back = (
    <Button variant="ghost" onClick={onReset}>
      {dict.cancel}
    </Button>
  );
  const retry = (
    <Button onClick={() => onCapture(state.source)}>{dict.tryAgain}</Button>
  );

  switch (state.reason) {
    case "no-access":
      return (
        <Notice
          icon={KeyRoundIcon}
          title={dict.errors.noAccess.title}
          actions={
            <>
              <Button onClick={() => onGrant(state.source)}>
                {dict.errors.noAccess.action}
              </Button>
              {back}
            </>
          }
        >
          {dict.errors.noAccess.body}
        </Notice>
      );
    case "restricted":
      return (
        <Notice
          icon={BanIcon}
          title={dict.errors.restricted.title}
          actions={back}
        >
          {dict.errors.restricted.body}
        </Notice>
      );
    case "file-access":
    case "pdf-protected":
    case "pdf-invalid":
    case "pdf-no-text":
    case "pdf-too-large":
    case "pdf-unreadable": {
      const { title, body } = dict.errors[pdfErrorKeys[state.reason]];
      return (
        <Notice
          icon={FileWarningIcon}
          title={title}
          actions={
            // Only a failed download may work the second time
            state.reason === "pdf-unreadable" ? (
              <>
                {retry}
                {back}
              </>
            ) : (
              back
            )
          }
        >
          {body}
        </Notice>
      );
    }
    case "empty":
      return (
        <Notice
          icon={TextSearchIcon}
          title={dict.errors.empty.title}
          actions={
            <>
              {retry}
              {back}
            </>
          }
        >
          {dict.errors.empty.body}
        </Notice>
      );
    case "unknown":
      return (
        <Notice
          variant="destructive"
          icon={TriangleAlertIcon}
          title={dict.errors.unknown.title}
          actions={
            <>
              {retry}
              {back}
            </>
          }
        />
      );
  }
}
