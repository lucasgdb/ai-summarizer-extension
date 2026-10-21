import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { getDictionary, localeConfig, otherLocale } from "@/lib/i18n";
import { setLocale, useLocale } from "@/lib/use-locale";

// Like lucasbittencourt.dev: shows the language you switch to, described in it
export function LanguageSwitch() {
  const target = otherLocale(useLocale());
  const { htmlLang, label } = localeConfig[target];
  const description = getDictionary(target).languageSwitch;

  return (
    <Hint label={description}>
      <Button
        variant="ghost"
        size="icon"
        lang={htmlLang}
        aria-label={description}
        className="text-xs text-muted-foreground"
        onClick={() => setLocale(target)}
      >
        {label}
      </Button>
    </Hint>
  );
}
