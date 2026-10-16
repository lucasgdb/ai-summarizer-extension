import { MousePointerClickIcon } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import type { PickerCommand } from "@/lib/messages";
import { useDictionary } from "@/lib/use-locale";
import { Notice } from "./notice";

const keys = [
  ["parent", "↑"],
  ["child", "↓"],
  ["select", "Enter"],
  ["cancel", "Esc"],
] as const satisfies [PickerCommand, string][];

/**
 * A legend, not buttons: picking happens with the mouse on the page, and the
 * keys work from there or from the panel (it forwards them)
 */
export function PickingHint() {
  const dict = useDictionary();

  return (
    <Notice icon={MousePointerClickIcon} title={dict.pickingTitle}>
      <p>{dict.pickingHint}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {keys.map(([command, key]) => (
          <div key={command} className="flex items-center gap-2">
            <dt>
              <Kbd>{key}</Kbd>
            </dt>
            <dd>{dict.commands[command]}</dd>
          </div>
        ))}
      </dl>
    </Notice>
  );
}
