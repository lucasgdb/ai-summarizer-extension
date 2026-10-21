import NumberFlow from "@number-flow/react";
import {
  CoinsIcon,
  LanguagesIcon,
  LogOutIcon,
  MonitorSmartphoneIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { Hint } from "@/components/hint";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Session, signOut, signOutEverywhere } from "@/lib/auth";
import {
  formatCredits,
  formatNumber,
  getDictionary,
  localeConfig,
  otherLocale,
} from "@/lib/i18n";
import { useBalance } from "@/lib/queries";
import { toggleTheme } from "@/lib/theme";
import { setLocale, useDictionary, useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";
import { TextSkeleton } from "./text-skeleton";
import { Spinner } from "./ui/spinner";

export function AccountMenu({
  session,
  onOpenCredits,
  onBuyCredits,
}: {
  session: Session;
  onOpenCredits: () => void;
  onBuyCredits: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const balance = useBalance(session);
  const { user } = session;
  const name = user.name ?? user.email ?? dict.account.menu;
  const credits = balance.data;
  const label =
    credits === undefined
      ? dict.account.menu
      : `${dict.account.menu} · ${formatCredits(locale, credits)}`;

  const [confirmingSignOutAll, setConfirmingSignOutAll] = useState(false);

  return (
    <>
      <DropdownMenu>
        <Hint label={`${name} · ${label}`}>
          <DropdownMenuTrigger asChild>
            {/* One pill for the account: the balance belongs to it, and the
              header has no room for both as separate controls */}
            <Button
              variant="outline"
              className="h-8 gap-1.5 rounded-full pr-1 pl-2.5"
              aria-label={label}
            >
              {/* Narrow panels (Chrome allows 320px) keep the number, drop the coin */}
              <CoinsIcon className="text-muted-foreground max-[22rem]:hidden" />
              <span
                className={cn(
                  "min-w-4 text-xs tabular-nums",
                  // Nothing left, or below zero after a reversed purchase
                  credits !== undefined && credits <= 0 && "text-destructive",
                )}
              >
                {credits === undefined ? (
                  <TextSkeleton className="w-6" />
                ) : (
                  // Rolls the digits up or down as credits are spent or added
                  <NumberFlow
                    value={credits}
                    locales={localeConfig[locale].intl}
                  />
                )}
              </span>
              {/* 24px: fills the pill's height, minus the border */}
              <Avatar className="size-6">
                {user.avatar_url && (
                  // Google's image host rejects requests that carry a referrer
                  <AvatarImage
                    src={user.avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                )}
                <AvatarFallback className="text-[0.625rem]">
                  {name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate font-medium text-foreground">{name}</p>
            {user.name && (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenCredits}>
            <CoinsIcon />
            {dict.credits.title}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {balance.data === undefined ? (
                <TextSkeleton className="w-8" />
              ) : (
                formatNumber(locale, balance.data)
              )}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onBuyCredits}>
            <PlusIcon />
            {dict.buy.open}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* The header's language and theme buttons, while signed in */}
          <DropdownMenuItem
            lang={localeConfig[otherLocale(locale)].htmlLang}
            onSelect={() => setLocale(otherLocale(locale))}
          >
            <LanguagesIcon />
            {getDictionary(otherLocale(locale)).languageSwitch}
          </DropdownMenuItem>
          <DropdownMenuItem
            // Keeps the menu open: the switch is visible right away
            onSelect={(event) => {
              event.preventDefault();
              toggleTheme();
            }}
          >
            <MoonIcon className="dark:hidden" />
            <SunIcon className="hidden dark:block" />
            <span className="dark:hidden">{dict.darkTheme}</span>
            <span className="hidden dark:inline">{dict.lightTheme}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOut(session)}>
            <LogOutIcon />
            {dict.account.signOut}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmingSignOutAll(true)}>
            <MonitorSmartphoneIcon />
            {dict.account.signOutAll}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu: it closes as the item is picked */}
      <SignOutAllDialog
        session={session}
        open={confirmingSignOutAll}
        onOpenChange={setConfirmingSignOutAll}
      />
    </>
  );
}

/**
 * Confirms "Sign out of all devices". It stays open while the API ends the
 * sessions, and says so if that fails (this device stays signed in then)
 */
function SignOutAllDialog({
  session,
  open,
  onOpenChange,
}: {
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dict = useDictionary();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setPending(true);
    setFailed(false);
    try {
      // Signed out: the panel goes back to the sign-in screen by itself
      await signOutEverywhere(session);
    } catch (error) {
      console.error(error);
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setFailed(false);
        onOpenChange(next);
      }}
    >
      {/* Our own X: the generated one has an English-only label */}
      <DialogContent showCloseButton={false}>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2 text-muted-foreground"
            aria-label={dict.close}
            disabled={pending}
          >
            <XIcon />
          </Button>
        </DialogClose>
        <DialogHeader className="pr-8">
          <DialogTitle>{dict.account.signOutAllTitle}</DialogTitle>
          <DialogDescription>{dict.account.signOutAllBody}</DialogDescription>
        </DialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {dict.account.signOutAllError}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {dict.cancel}
            </Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" />}
            {dict.account.signOutAllConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
