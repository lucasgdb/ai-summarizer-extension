import { Trash2Icon, XIcon } from "lucide-react";
import { useInLoading } from "@/components/loadable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useDictionary } from "@/lib/use-locale";

/**
 * "Delete", confirmed in a dialog that says exactly what goes. A plain dialog,
 * not an alert one: Esc, a click outside or the X all back out of it
 */
export function DeleteButton({
  title,
  body,
  onConfirm,
  confirmLabel,
  alternative,
  pending,
}: {
  title: string;
  body: string;
  onConfirm: () => void;
  /** The main action's label; "Delete" by default */
  confirmLabel?: string;
  /** A second, wider way to delete (e.g. "Delete everything") */
  alternative?: { label: string; onConfirm: () => void };
  pending: boolean;
}) {
  const dict = useDictionary();
  // The summary it deletes is still loading
  const loading = useInLoading();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={pending || loading}
        >
          {pending ? (
            <Spinner data-icon="inline-start" label={dict.loading} />
          ) : (
            <Trash2Icon data-icon="inline-start" />
          )}
          {dict.history.delete}
        </Button>
      </DialogTrigger>
      {/* Our own X: the generated one has an English-only label */}
      <DialogContent showCloseButton={false}>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2 text-muted-foreground"
            aria-label={dict.close}
          >
            <XIcon />
          </Button>
        </DialogClose>
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{dict.cancel}</Button>
          </DialogClose>
          {alternative && (
            <DialogClose asChild>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={alternative.onConfirm}
              >
                {alternative.label}
              </Button>
            </DialogClose>
          )}
          <DialogClose asChild>
            <Button variant="destructive" onClick={onConfirm}>
              {confirmLabel ?? dict.history.delete}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
