import type { CSSProperties } from "react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

// Toast host. Hardcodes "light" (the popup is a fixed light surface) so we skip
// next-themes. The `contents` wrapper catches clicks bubbling from a toast and
// dismisses (sonner has no per-toast click handler).
function Toaster(props: ToasterProps) {
  return (
    <div
      className="contents"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-sonner-toast]")) toast.dismiss();
      }}
    >
      <Sonner
        theme="light"
        className="toaster group"
        position="top-center"
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
          } as CSSProperties
        }
        {...props}
      />
    </div>
  );
}

export { Toaster };
