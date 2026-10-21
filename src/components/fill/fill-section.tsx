import {
  BanIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  FileTextIcon,
  KeyRoundIcon,
  ListIcon,
  SquareDashedMousePointerIcon,
  TextCursorInputIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { browser } from "#imports";
import { BackButton } from "@/components/back-button";
import { useElapsedSeconds } from "@/components/elapsed-seconds";
import { Notice } from "@/components/notice";
import { PickingHint } from "@/components/picking-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Session } from "@/lib/auth";
import { keyCommands } from "@/lib/bridge/picker";
import { type FillChoices, FillError, streamFill } from "@/lib/forms";
import { formatCredits, formatNumber, getDictionary } from "@/lib/i18n";
import type {
  FillOutcome,
  FillReport,
  FormAnswer,
  FormField,
  PickerCommand,
  ScannedForm,
} from "@/lib/messages";
import {
  currentTabId,
  type FillSession,
  openFillSession,
  PageError,
  type PageErrorReason,
  pickForm,
  requestAccess,
  scanPageForm,
  undoPageFill,
} from "@/lib/page";
import { queryClient, refreshAfterFailure, setBalance } from "@/lib/queries";
import { continueInPanel } from "@/lib/ui-mode";
import { useUiMode } from "@/lib/ui-mode-context";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";
import { FillForm } from "./fill-form";

type Source = "element" | "page";

type State =
  | { status: "idle" }
  | { status: "picking" }
  | { status: "scanning" }
  | {
      status: "ready";
      form: ScannedForm;
      tabId: number;
      /** What was typed last time: back after a failure or an undo */
      context?: string;
      /** Why the last try didn't go through, or what the undo did */
      notice?: string;
    }
  | {
      status: "filling";
      form: ScannedForm;
      tabId: number;
      context: string;
      startedAt: string;
      /** Thinking until the first piece of an answer arrives */
      phase: "thinking" | "filling";
      /** Final answers so far, in order */
      answers: FormAnswer[];
      /** Text answers being typed, by field id */
      drafts: Record<string, string>;
      /** What the page made of each answer that landed */
      outcomes: Record<string, FillOutcome>;
    }
  | {
      status: "done";
      form: ScannedForm;
      tabId: number;
      context: string;
      answers: FormAnswer[];
      /** null: the page went away before the answers could be written */
      report: FillReport | null;
      /** Stopped early (an error, a cancel): what the answers above are */
      notice?: string;
    }
  | { status: "empty"; source: Source }
  | { status: "error"; reason: PageErrorReason | "unknown"; source: Source };

/**
 * "fill": pick a form (or use the whole page), say how to answer it, and the
 * answers are written into the page. Nothing is saved and nothing is sent.
 */
export function FillSection({
  session,
  handedPick,
}: {
  session: Session;
  /** Counts the picks handed over by the popup: each new one starts one */
  handedPick: number;
}) {
  const locale = useLocale();
  const mode = useUiMode();
  const dict = getDictionary(locale);
  const [state, setState] = useState<State>({ status: "idle" });
  const job = useRef<AbortController | null>(null);
  const sendToPicker = useRef<((command: PickerCommand) => void) | null>(null);
  // A fill stopped with "Cancel" (not by leaving): what landed is shown
  const cancelled = useRef(false);

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

  async function capture(source: Source) {
    // The popup would close on the first click on the page: the side panel
    // picks instead (opened here, while this is still the click)
    if (source === "element" && mode === "popup") {
      void continueInPanel("pick-form");
      return;
    }
    const signal = startJob();
    setState({ status: source === "element" ? "picking" : "scanning" });
    try {
      // The answers go back to this tab, even if another one is active then
      const tabId = await currentTabId();
      const form =
        source === "element"
          ? await pickForm(signal, (send) => {
              sendToPicker.current = send;
            })
          : await scanPageForm();
      if (signal.aborted) return;
      if (!form) {
        setState({ status: "idle" });
        return;
      }
      setState(
        form.fields.length === 0
          ? { status: "empty", source }
          : { status: "ready", form, tabId },
      );
    } catch (error) {
      if (signal.aborted) return;
      console.error(error);
      const reason = error instanceof PageError ? error.reason : "unknown";
      setState({ status: "error", reason, source });
    } finally {
      sendToPicker.current = null;
    }
  }

  async function grantAndRetry(source: Source) {
    if (await requestAccess()) await capture(source);
  }

  /** What's known so far of a fill in progress, on screen as it arrives */
  type Progress = {
    phase: "thinking" | "filling";
    answers: FormAnswer[];
    drafts: Record<string, string>;
    outcomes: Record<string, FillOutcome>;
  };

  async function fill(
    form: ScannedForm,
    tabId: number,
    context: string,
    choices: FillChoices,
    price: number,
  ) {
    const signal = startJob();
    const startedAt = new Date().toISOString();
    const progress: Progress = {
      phase: "thinking",
      answers: [],
      drafts: {},
      outcomes: {},
    };
    // Deltas arrive faster than it's worth re-rendering: one paint per frame
    let frame = 0;
    const paint = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        if (signal.aborted) return;
        setState({
          status: "filling",
          form,
          tabId,
          context,
          startedAt,
          ...progress,
          answers: [...progress.answers],
          drafts: { ...progress.drafts },
          outcomes: { ...progress.outcomes },
        });
      });
    };
    setState({
      status: "filling",
      form,
      tabId,
      context,
      startedAt,
      ...progress,
    });

    // What the page reports back, as each answer lands
    const outcomes = progress.outcomes;
    const partialReport = (): FillReport =>
      progress.answers.map(({ id }) => ({
        id,
        outcome: outcomes[id] ?? "failed",
      }));

    let page: FillSession;
    try {
      page = await openFillSession(tabId);
    } catch (error) {
      // The page went away (or reloaded) since it was scanned: nothing charged
      console.error("[ai-summarizer] fill session failed", error);
      setState({
        status: "ready",
        form,
        tabId,
        context,
        notice: dict.fill.pageChanged,
      });
      return;
    }

    try {
      const result = await streamFill(
        session.token,
        form,
        context,
        choices,
        price,
        {
          onStart: (charge) => setBalance(session, charge.credit_balance),
          onDelta: ({ id, text }) => {
            progress.phase = "filling";
            progress.drafts[id] = (progress.drafts[id] ?? "") + text;
            page.delta(id, text).catch(() => {});
            paint();
          },
          onAnswer: (answer) => {
            progress.phase = "filling";
            progress.answers.push(answer);
            delete progress.drafts[answer.id];
            page
              .answer(answer)
              .then((outcome) => {
                outcomes[answer.id] = outcome;
                paint();
              })
              .catch(() => {});
            paint();
          },
        },
        signal,
      );
      cancelAnimationFrame(frame);
      setBalance(session, result.credit_balance);
      queryClient.invalidateQueries({
        queryKey: ["credits", session.user.id, "transactions"],
      });
      // What the page reported as each answer landed: the result even if the
      // final check doesn't come back
      let report: FillReport | null = progress.answers.length
        ? partialReport()
        : null;
      try {
        report = (await page.finish(result.answers)) ?? report;
      } catch (error) {
        // The tab reloaded, navigated or closed since the answers went in
        console.error("[ai-summarizer] fill finish failed", error);
        if (!progress.answers.some(({ id }) => outcomes[id])) report = null;
      }
      if (signal.aborted) return;
      setState({
        status: "done",
        form,
        tabId,
        context,
        answers: result.answers,
        report,
      });
    } catch (error) {
      cancelAnimationFrame(frame);
      // Nothing more reaches the page; a field caught mid-typing goes back
      await page.abort().catch(() => {});
      const failure = error instanceof FillError ? error : null;
      if (failure?.reason === "unauthorized") return;
      if (!signal.aborted || cancelled.current) console.error(error);
      if (failure?.credits?.balance !== undefined) {
        setBalance(session, failure.credits.balance);
      }
      if (
        failure?.reason === "unavailable" ||
        failure?.reason === "timeout" ||
        failure?.reason === "incomplete" ||
        failure?.reason === "interrupted"
      ) {
        refreshAfterFailure(session);
      }
      // Leaving the screen or closing the panel: nothing to show
      if (signal.aborted && !cancelled.current) return;

      const notice = cancelled.current
        ? dict.fill.cancelled
        : failure?.reason === "price-changed" && failure.credits
          ? dict.fill.priceChanged(formatCredits(locale, failure.credits.price))
          : failure?.reason === "insufficient"
            ? undefined
            : failure?.reason === "offline"
              ? dict.summaryErrors.offline.title
              : failure?.reason === "interrupted"
                ? dict.fill.interrupted
                : failure?.reason === "incomplete"
                  ? dict.fill.incomplete
                  : `${dict.fill.failed}${
                      failure?.refunded
                        ? ` ${dict.credits.refunded}`
                        : failure?.reason === "invalid" && failure.detail
                          ? ` (${failure.detail})`
                          : ""
                    }`;
      cancelled.current = false;
      // Answers that landed stay on the page (and Undo covers them)
      if (progress.answers.length > 0) {
        setState({
          status: "done",
          form,
          tabId,
          context,
          answers: progress.answers,
          report: partialReport(),
          notice,
        });
        return;
      }
      // Priced again on the way back (insufficient, price changed)
      queryClient.invalidateQueries({ queryKey: ["quote", session.user.id] });
      setState({ status: "ready", form, tabId, context, notice });
    }
  }

  /** Stops reading; the API still finishes (and has charged) the fill */
  function cancel() {
    cancelled.current = true;
    job.current?.abort();
  }

  /**
   * The page as it was before the fill, and the panel as it was before
   * pressing Fill (the context, the choices): change something, fill again
   */
  async function undo() {
    if (state.status !== "done") return;
    const { form, tabId, context } = state;
    try {
      const { restored, kept } = await undoPageFill(tabId);
      setState({
        status: "ready",
        form,
        tabId,
        context,
        notice: `${dict.fill.undone(restored, formatNumber(locale, restored))}${
          kept > 0 ? ` ${dict.fill.radiosKept}` : ""
        }`,
      });
    } catch (error) {
      console.error(error);
      setState({ ...state, report: null });
    }
  }

  // Picking: the keys pressed in the panel drive the picker on the page
  const onPanelKey = useEffectEvent((event: KeyboardEvent) => {
    const command = keyCommands[event.key];
    if (!command) return;
    event.preventDefault();
    if (command === "cancel") reset();
    else sendToPicker.current?.(command);
  });
  useEffect(() => {
    if (state.status !== "picking") return;
    window.addEventListener("keydown", onPanelKey);
    return () => window.removeEventListener("keydown", onPanelKey);
  }, [state.status]);

  // The scanned fields belong to one page: another tab or a navigation
  // starts over (a fill in progress still lands on its own tab)
  const onPageChange = useEffectEvent(() => {
    if (state.status !== "filling") reset();
  });
  useEffect(() => {
    let windowId: number | undefined;
    browser.windows.getCurrent().then((window) => {
      windowId = window.id;
    });
    function onActivated(info: { windowId: number }) {
      if (info.windowId === windowId) onPageChange();
    }
    function onUpdated(
      _tabId: number,
      change: { status?: string },
      tab: { active: boolean; windowId: number },
    ) {
      if (
        tab.active &&
        tab.windowId === windowId &&
        change.status === "loading"
      ) {
        onPageChange();
      }
    }
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      job.current?.abort();
    };
  }, []);

  switch (state.status) {
    case "idle":
    case "scanning":
      return (
        <section>
          <h1 className="title mb-4 text-2xl font-semibold tracking-tighter">
            {dict.fill.heroTitle}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {dict.fill.heroBody}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              disabled={state.status === "scanning"}
              onClick={() => capture("element")}
            >
              <SquareDashedMousePointerIcon data-icon="inline-start" />
              {dict.fill.pickForm}
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={state.status === "scanning"}
              onClick={() => capture("page")}
            >
              {state.status === "scanning" ? (
                <Spinner data-icon="inline-start" aria-label={dict.loading} />
              ) : (
                <FileTextIcon data-icon="inline-start" />
              )}
              {dict.fill.wholePage}
            </Button>
          </div>
        </section>
      );

    case "picking":
      return (
        <div className="space-y-5">
          <BackButton onClick={reset}>{dict.back}</BackButton>
          <PickingHint />
        </div>
      );

    case "ready":
    case "filling":
      return (
        <div className="space-y-6">
          <BackButton onClick={reset}>{dict.back}</BackButton>
          <FormSummary form={state.form} />
          {state.status === "filling" ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <FillStatus
                  phase={state.phase}
                  startedAt={state.startedAt}
                  done={state.answers.length}
                  total={state.form.fields.length}
                />
                <Button variant="ghost" size="sm" onClick={cancel}>
                  {dict.cancel}
                </Button>
              </div>
              <AnswerList
                form={state.form}
                answers={state.answers}
                outcomes={state.outcomes}
                drafts={state.drafts}
              />
            </div>
          ) : (
            <FillForm
              session={session}
              form={state.form}
              initialContext={state.context}
              notice={state.notice}
              onFill={(context, choices, price) =>
                fill(state.form, state.tabId, context, choices, price)
              }
            />
          )}
        </div>
      );

    case "done":
      return (
        <div className="space-y-6">
          <BackButton onClick={reset}>{dict.back}</BackButton>
          {state.report ? (
            <Notice
              icon={state.notice ? TriangleAlertIcon : CircleCheckIcon}
              title={
                state.notice ? dict.fill.stoppedTitle : dict.fill.doneTitle
              }
              actions={
                <>
                  <Button variant="outline" size="sm" onClick={undo}>
                    <Undo2Icon data-icon="inline-start" />
                    {dict.fill.undo}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    {dict.fill.again}
                  </Button>
                </>
              }
            >
              {state.notice && `${state.notice} `}
              {dict.fill.doneBody}
            </Notice>
          ) : (
            <Notice icon={TriangleAlertIcon} title={dict.fill.pageChanged} />
          )}
          <AnswerList
            form={state.form}
            answers={state.answers}
            outcomes={Object.fromEntries(
              (state.report ?? []).map(({ id, outcome }) => [id, outcome]),
            )}
          />
        </div>
      );

    case "empty":
      return (
        <div className="space-y-5">
          <BackButton onClick={reset}>{dict.back}</BackButton>
          <Notice
            icon={TextCursorInputIcon}
            title={dict.fill.noFieldsTitle}
            actions={
              <>
                <Button onClick={() => capture("element")}>
                  {dict.fill.pickForm}
                </Button>
                {state.source === "element" && (
                  <Button variant="outline" onClick={() => capture("page")}>
                    {dict.fill.wholePage}
                  </Button>
                )}
              </>
            }
          >
            {dict.fill.noFieldsBody}
          </Notice>
        </div>
      );

    case "error": {
      const { source } = state;
      const back = (
        <Button variant="ghost" onClick={reset}>
          {dict.cancel}
        </Button>
      );
      if (state.reason === "no-access") {
        return (
          <Notice
            icon={KeyRoundIcon}
            title={dict.errors.noAccess.title}
            actions={
              <>
                <Button onClick={() => grantAndRetry(source)}>
                  {dict.errors.noAccess.action}
                </Button>
                {back}
              </>
            }
          >
            {dict.errors.noAccess.body}
          </Notice>
        );
      }
      if (state.reason === "restricted") {
        return (
          <Notice
            icon={BanIcon}
            title={dict.errors.restricted.title}
            actions={back}
          >
            {dict.errors.restricted.body}
          </Notice>
        );
      }
      return (
        <Notice
          variant="destructive"
          icon={TriangleAlertIcon}
          title={dict.fill.failed}
          actions={
            <>
              <Button onClick={() => capture(source)}>{dict.tryAgain}</Button>
              {back}
            </>
          }
        />
      );
    }
  }
}

/** "8 fields · 5 required · 2 already answered", and the list on demand */
function FormSummary({ form }: { form: ScannedForm }) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const id = useId();
  const [open, setOpen] = useState(false);
  const count = form.fields.length;
  const required = form.fields.filter((field) => field.required).length;
  const filled = form.fields.filter((field) => field.filled).length;
  const host = URL.canParse(form.url) ? new URL(form.url).hostname : "";

  return (
    <section className="space-y-3">
      <h2 className="font-medium tracking-tight">{dict.fill.form}</h2>
      <div className="flex flex-wrap gap-1.5">
        {host && <Badge variant="secondary">{host}</Badge>}
        {form.label && (
          <Badge variant="outline" className="max-w-full font-mono">
            <span className="truncate">{form.label}</span>
          </Badge>
        )}
        <Badge variant="outline" className="tabular-nums">
          {dict.fill.fields(count, formatNumber(locale, count))}
        </Badge>
        {required > 0 && (
          <Badge variant="outline" className="tabular-nums">
            {dict.fill.required(required, formatNumber(locale, required))}
          </Badge>
        )}
        {filled > 0 && (
          <Badge variant="outline" className="tabular-nums">
            {dict.fill.alreadyFilled(formatNumber(locale, filled))}
          </Badge>
        )}
      </div>
      {(form.sensitive > 0 || form.unsupported > 0 || form.truncated) && (
        <p className="text-sm text-muted-foreground">
          {[
            form.sensitive > 0 &&
              dict.fill.sensitive(
                form.sensitive,
                formatNumber(locale, form.sensitive),
              ),
            form.unsupported > 0 &&
              dict.fill.unsupported(
                form.unsupported,
                formatNumber(locale, form.unsupported),
              ),
            form.truncated && dict.fill.truncated(formatNumber(locale, 100)),
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}
      {/* The same disclosure as the summarize form's Options */}
      <div className="rounded-lg border">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-fields`}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
            open ? "rounded-t-lg" : "rounded-lg",
          )}
        >
          <ListIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{dict.fill.fieldsTitle}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {form.fields.map((field) => field.label || field.id).join(" · ")}
          </span>
          <ChevronDownIcon
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <m.div
              key="fields"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <ol
                id={`${id}-fields`}
                className="list-decimal space-y-1 border-t py-3 pr-4 pl-9 text-sm text-muted-foreground"
              >
                {form.fields.map((field) => (
                  <li key={field.id}>{field.label || field.id}</li>
                ))}
              </ol>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** What an answer reads like: the option's label, not its value */
function answerText(
  field: FormField,
  answer: FormAnswer,
  dict: ReturnType<typeof getDictionary>,
) {
  if (answer.checked != null) {
    return answer.checked ? dict.fill.checked : dict.fill.unchecked;
  }
  const labelFor = (value: string) =>
    field.options?.find((option) => option.value === value)?.label ?? value;
  if (answer.values) return answer.values.map(labelFor).join(", ");
  if (answer.value == null) return "";
  return field.options ? labelFor(answer.value) : answer.value;
}

/** "Thinking… 4s" until the first answer starts, then "Filling… 3 of 11" */
function FillStatus({
  phase,
  startedAt,
  done,
  total,
}: {
  phase: "thinking" | "filling";
  startedAt: string;
  done: number;
  total: number;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const seconds = useElapsedSeconds(startedAt);

  return (
    <p
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums"
    >
      <Spinner />
      {phase === "thinking"
        ? seconds > 0
          ? dict.thinkingFor(seconds)
          : dict.thinking
        : `${dict.fill.filling} ${dict.fill.progress(
            formatNumber(locale, done),
            formatNumber(locale, total),
          )}`}
    </p>
  );
}

/**
 * Question, then the answer as written (or why it stayed blank). While a fill
 * streams, the field being typed shows its text so far
 */
function AnswerList({
  form,
  answers,
  outcomes,
  drafts = {},
}: {
  form: ScannedForm;
  answers: FormAnswer[];
  outcomes: Record<string, FillOutcome>;
  drafts?: Record<string, string>;
}) {
  const dict = getDictionary(useLocale());
  const typing = Object.entries(drafts);

  return (
    <ul className="space-y-4">
      {answers.map((answer) => {
        const field = form.fields.find(
          (candidate) => candidate.id === answer.id,
        );
        if (!field) return null;
        const outcome = outcomes[answer.id];
        return (
          <li key={answer.id} className="space-y-1">
            <p className="text-sm font-medium tracking-tight">
              {field.label || field.id}
            </p>
            {answer.skipped != null ? (
              <p className="text-sm text-muted-foreground italic">
                {dict.fill.outcomes.skipped}
                {answer.skipped && ` · ${answer.skipped}`}
              </p>
            ) : (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {answerText(field, answer, dict)}
              </p>
            )}
            {outcome && outcome !== "filled" && outcome !== "skipped" && (
              <p
                className={
                  outcome === "failed"
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {dict.fill.outcomes[outcome]}
              </p>
            )}
          </li>
        );
      })}
      {typing.map(([id, text]) => {
        const field = form.fields.find((candidate) => candidate.id === id);
        return (
          <li key={id} className="space-y-1" aria-busy="true">
            <p className="text-sm font-medium tracking-tight">
              {field?.label || id}
            </p>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {text}
              <span className="ml-0.5 inline-block h-[1em] w-px animate-pulse bg-current align-[-0.15em]" />
            </p>
          </li>
        );
      })}
    </ul>
  );
}
