import { MoonIcon, SunIcon } from "lucide-react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { toggleTheme } from "@/lib/theme";
import { useDictionary } from "@/lib/use-locale";

export function ThemeToggle() {
  const dict = useDictionary();
  const label = dict.themeToggle;

  return (
    <Hint label={label}>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground"
        onClick={toggleTheme}
        aria-label={label}
      >
        <MoonIcon className="dark:hidden" />
        <SunIcon className="hidden dark:block" />
      </Button>
    </Hint>
  );
}
