import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";

type Theme = "light" | "dark" | "system";
const storageKey = "kondo-theme";
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: "system", setTheme: () => {} });

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Use the system preference when storage is unavailable. */ }
  return "system";
}

// Run before styles paint so a saved dark preference never flashes light.
export const themeScript = `(()=>{let t="system";try{const s=localStorage.getItem("${storageKey}");if(s==="light"||s==="dark")t=s}catch{}document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t})()`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setPreference] = useState<Theme>("system");
  const preferenceRef = useRef<Theme>("system");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function applyTheme() {
      const preference = preferenceRef.current;
      document.documentElement.dataset.theme = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    }
    function syncTheme() {
      preferenceRef.current = readTheme();
      setPreference(preferenceRef.current);
      applyTheme();
    }
    syncTheme();
    media.addEventListener("change", applyTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      media.removeEventListener("change", applyTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  function setTheme(preference: Theme) {
    preferenceRef.current = preference;
    setPreference(preference);
    try { localStorage.setItem(storageKey, preference); } catch { /* In-memory selection still works. */ }
    document.documentElement.dataset.theme = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, setTheme } = useContext(ThemeContext);
  return <div className="inline-flex shrink-0 gap-0.5 p-0.75 border border-border rounded-lg bg-surface shadow-(--shadow) [&_button]:grid [&_button]:w-7 [&_button]:h-6.5 [&_button]:place-items-center [&_button]:rounded-sm [&_button]:text-muted-foreground [&_button:hover]:bg-muted [&_button:hover]:text-foreground [&_button[aria-pressed='true']]:bg-muted [&_button[aria-pressed='true']]:text-foreground" role="group" aria-label="Appearance">
    {(["light", "dark", "system"] as const).map((value) => <button key={value} type="button" aria-label={`${value[0].toUpperCase()}${value.slice(1)} theme`} aria-pressed={theme === value} title={`${value[0].toUpperCase()}${value.slice(1)} theme`} onClick={() => setTheme(value)}>
      <Icon name={value === "light" ? "sun" : value === "dark" ? "moon" : "monitor"} width="16" height="16" />
    </button>)}
  </div>;
}
