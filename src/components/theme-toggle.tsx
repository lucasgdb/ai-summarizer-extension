import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleTheme } from "@/lib/theme";
import { useDictionary } from "@/lib/use-locale";

export function ThemeToggle() {
  const dict = useDictionary();
  const label = dict.themeToggle;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
