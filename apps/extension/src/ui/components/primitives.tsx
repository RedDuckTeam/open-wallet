import React, { useId, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { avatarGradient } from "../format/avatar.js";
import { cn } from "../lib/utils.js";
import { Alert, AlertDescription } from "./shadcn/alert.js";
import { Button } from "./shadcn/button.js";
import { Input } from "./shadcn/input.js";
import { Label } from "./shadcn/label.js";
import { Textarea } from "./shadcn/textarea.js";

// Token logo with a letter-placeholder fallback when there's no icon or it fails to load.
export function TokenIcon({
  src,
  symbol,
  size = 36,
}: {
  src: string | null;
  symbol: string;
  size?: number;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full bg-muted object-cover ring-1 ring-black/5"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="bg-muted text-muted-foreground grid shrink-0 place-items-center rounded-full text-[13px] font-bold"
      style={{ width: size, height: size }}
    >
      {symbol.slice(0, 3)}
    </span>
  );
}

// Generative gradient identicon for an account address.
export function Avatar({ seed, size = 28 }: { seed: string; size?: number }): React.ReactElement {
  return (
    <span
      className="inline-block shrink-0 rounded-full ring-1 ring-black/5"
      style={{ width: size, height: size, background: avatarGradient(seed) }}
    />
  );
}

// Small brand-colored dot for a network.
export function NetworkDot({
  color,
  size = 8,
}: {
  color: string;
  size?: number;
}): React.ReactElement {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

export function Spinner({ className }: { className?: string }): React.ReactElement {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden />;
}

// Full-height centered spinner for initial load.
export function Splash(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner className="text-muted-foreground size-6" />
    </div>
  );
}

// Standard screen chrome: header (optional back + centered title) and a padded body.
export function Screen({
  title,
  onBack,
  action,
  children,
}: {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col">
      <header className="grid grid-cols-[36px_1fr_36px] items-center gap-2 border-b px-3 py-2.5">
        {onBack ? (
          <Button variant="ghost" size="icon" className="size-9" onClick={onBack} aria-label="Back">
            <ArrowLeft />
          </Button>
        ) : (
          <span />
        )}
        <h1 className="text-center text-[15px] font-semibold">{title}</h1>
        <span className="justify-self-end">{action}</span>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
    </div>
  );
}

// Standard form field: Label + Input/Textarea + optional hint.
export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline = false,
  autoFocus = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  hint?: string;
}): React.ReactElement {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          className="min-h-20 resize-none font-mono text-[13px]"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={3}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
      {hint ? <span className="text-muted-foreground text-[11.5px]">{hint}</span> : null}
    </div>
  );
}

const CALLOUT_VARIANT = {
  error: "destructive",
  info: "info",
  success: "success",
} as const;

// Tone-colored inline message, built on shadcn's Alert.
export function Callout({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "success";
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Alert variant={CALLOUT_VARIANT[tone]}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

// Recovery-phrase words in a numbered grid.
export function MnemonicGrid({ mnemonic }: { mnemonic: string }): React.ReactElement {
  return (
    <div className="grid grid-cols-3 gap-2">
      {mnemonic.split(" ").map((word, i) => (
        <span
          className="bg-muted flex items-center gap-1.5 rounded-md border px-2.5 py-2 font-mono text-[13px]"
          key={`${word}-${String(i)}`}
        >
          <span className="text-muted-foreground text-[11px]">{i + 1}</span>
          {word}
        </span>
      ))}
    </div>
  );
}
