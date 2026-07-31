import React from "react";
import { Button } from "./shadcn/button.js";

// Catches render crashes so a bug shows a recoverable screen, not a blank popup.
// Must be a class component. Doesn't show the raw error (could be sensitive).
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            The wallet hit an unexpected error. Reloading usually fixes it. Your funds and recovery
            phrase are safe.
          </p>
        </div>
        <Button onClick={() => location.reload()}>Reload</Button>
      </div>
    );
  }
}
