import { useEffect, useRef } from "react";

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      action: string;
      callback: () => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      sitekey: string;
    },
  ): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const scriptId = "cloudflare-turnstile-script";

export function Turnstile({
  navigationState,
  onReadyChange,
  siteKey,
}: {
  navigationState: "idle" | "loading" | "submitting";
  onReadyChange: (ready: boolean) => void;
  siteKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const previousNavigationState = useRef(navigationState);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const renderWidget = () => {
      if (cancelled || widgetIdRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        action: "signup",
        callback: () => onReadyChange(true),
        "error-callback": () => onReadyChange(false),
        "expired-callback": () => onReadyChange(false),
      });
    };

    const existingScript = document.getElementById(scriptId);
    if (window.turnstile) {
      renderWidget();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderWidget);
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget);
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      existingScript?.removeEventListener("load", renderWidget);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onReadyChange, siteKey]);

  useEffect(() => {
    if (
      previousNavigationState.current === "submitting" &&
      navigationState === "idle" &&
      widgetIdRef.current &&
      window.turnstile
    ) {
      onReadyChange(false);
      window.turnstile.reset(widgetIdRef.current);
    }
    previousNavigationState.current = navigationState;
  }, [navigationState, onReadyChange]);

  return <div ref={containerRef} className="min-h-[65px]" />;
}
