import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  localDateToYmd,
  maskBrDateInput,
  parseBrDateToYmd,
  ymdToBrDisplay,
  ymdToLocalDate,
} from "@/lib/date-br";

export type DateInputBRChangeEvent = { target: { value: string; name?: string } };

export type DateInputBRProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max"
> & {
  /** Valor controlado em YYYY-MM-DD (contrato dos antigos type="date"). */
  value?: string;
  /** defaultValue em YYYY-MM-DD (não controlado). */
  defaultValue?: string;
  min?: string;
  max?: string;
  /** Emite sempre YYYY-MM-DD (ou ""), compatível com e.target.value. */
  onChange?: (e: DateInputBRChangeEvent) => void;
};

/**
 * Campo de data no padrão BR (DD/MM/YYYY) com calendário.
 * Valor externo permanece YYYY-MM-DD — drop-in para type="date".
 */
export const DateInputBR = React.forwardRef<HTMLInputElement, DateInputBRProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onBlur,
      min,
      max,
      disabled,
      className,
      name,
      id,
      placeholder = "dd/mm/aaaa",
      required,
      ...rest
    },
    ref,
  ) => {
    const isControlled = value !== undefined;
    const [uncontrolledYmd, setUncontrolledYmd] = React.useState(
      () => (defaultValue ? String(defaultValue).slice(0, 10) : "") || "",
    );
    const ymd = isControlled ? String(value || "") : uncontrolledYmd;

    const [text, setText] = React.useState(() => ymdToBrDisplay(ymd));
    const [open, setOpen] = React.useState(false);
    const lastYmdRef = React.useRef(ymd);

    React.useEffect(() => {
      if (ymd === lastYmdRef.current) return;
      lastYmdRef.current = ymd;
      setText(ymdToBrDisplay(ymd));
    }, [ymd]);

    const emit = React.useCallback(
      (nextYmd: string) => {
        if (!isControlled) setUncontrolledYmd(nextYmd);
        lastYmdRef.current = nextYmd;
        onChange?.({ target: { value: nextYmd, name } });
      },
      [isControlled, name, onChange],
    );

    const minDate = min ? ymdToLocalDate(min) : undefined;
    const maxDate = max ? ymdToLocalDate(max) : undefined;
    const selected = ymd ? ymdToLocalDate(ymd) ?? undefined : undefined;

    const commitText = (raw: string) => {
      const masked = maskBrDateInput(raw);
      setText(masked);
      if (!masked) {
        emit("");
        return;
      }
      const parsed = parseBrDateToYmd(masked);
      if (parsed) {
        if (min && parsed < min) return;
        if (max && parsed > max) return;
        emit(parsed);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const parsed = parseBrDateToYmd(text);
      if (parsed) {
        setText(ymdToBrDisplay(parsed));
        if (parsed !== ymd) emit(parsed);
      } else if (text.trim() === "") {
        setText("");
        if (ymd) emit("");
      } else {
        setText(ymdToBrDisplay(ymd));
      }
      onBlur?.(e);
    };

    return (
      <div
        className={cn(
          "relative flex h-10 w-full items-center rounded-lg border border-neutral-300 bg-white text-sm text-neutral-900 shadow-sm transition-all duration-200 focus-within:outline-none focus-within:ring-2 focus-within:ring-neutral-900/10 focus-within:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-within:ring-neutral-400/20 dark:focus-within:border-neutral-500",
          disabled && "cursor-not-allowed bg-neutral-50 text-neutral-400 opacity-70 dark:bg-neutral-900",
          className,
        )}
      >
        <input
          {...rest}
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={text}
          onChange={(e) => commitText(e.target.value)}
          onBlur={handleBlur}
          className="h-full w-full min-w-0 flex-1 border-0 bg-transparent px-3.5 py-2 pr-9 font-mono text-inherit placeholder:text-neutral-400 outline-none disabled:cursor-not-allowed dark:placeholder:text-neutral-500"
          data-date-ymd={ymd || undefined}
        />
        <Popover modal open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              className="absolute right-1 top-1/2 z-10 -translate-y-1/2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              aria-label="Abrir calendário"
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected || minDate || undefined}
              onSelect={(day) => {
                if (!day) return;
                const next = localDateToYmd(day);
                if (!next) return;
                if (min && next < min) return;
                if (max && next > max) return;
                setText(ymdToBrDisplay(next));
                emit(next);
                setOpen(false);
              }}
              disabled={[
                ...(minDate ? [{ before: minDate }] : []),
                ...(maxDate ? [{ after: maxDate }] : []),
              ]}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
DateInputBR.displayName = "DateInputBR";

export default DateInputBR;
