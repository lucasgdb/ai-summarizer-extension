import NumberFlow from "@number-flow/react";
import {
  CoinsIcon,
  LanguagesIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Session, signOut } from "@/lib/auth";
import {
  formatCredits,
  formatNumber,
  getDictionary,
  localeConfig,
  otherLocale,
} from "@/lib/i18n";
import { useBalance } from "@/lib/queries";
import { toggleTheme } from "@/lib/theme";
import { setLocale, useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";
import { TextSkeleton } from "./text-skeleton";

export function AccountMenu({
  session,
  onOpenCredits,
}: {
  session: Session;
  onOpenCredits: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const balance = useBalance(session);
  const { user } = session;
  const name = user.name ?? user.email;
  const credits = balance.data;
  const label =
    credits === undefined
      ? dict.account.menu
      : `${dict.account.menu} · ${formatCredits(locale, credits)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* One pill for the account: the balance belongs to it, and the
            header has no room for both as separate controls */}
        <Button
          variant="outline"
          className="h-8 gap-1.5 rounded-full pr-1 pl-2.5"
          aria-label={label}
          title={`${name} · ${label}`}
        >
          {/* Narrow panels (Chrome allows 320px) keep the number, drop the coin */}
          <CoinsIcon className="text-muted-foreground max-[22rem]:hidden" />
          <span
            className={cn(
              "min-w-4 text-xs tabular-nums",
              // Nothing left: summaries are blocked until top-ups exist
              credits === 0 && "text-destructive",
            )}
          >
            {credits === undefined ? (
              <TextSkeleton className="w-6" />
            ) : (
              // Rolls the digits up or down as credits are spent or added
              <NumberFlow value={credits} locales={localeConfig[locale].intl} />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
