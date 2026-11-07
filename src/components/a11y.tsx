"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

type FontSize = "normal" | "large" | "x-large";
type Spacing = "normal" | "relaxed" | "loose";
/** "easy" switches every word on the page to an easier-to-read typeface. */
type FontChoice = "default" | "easy";

interface Settings {
  fontSize: FontSize;
  spacing: Spacing;
  font: FontChoice;
}

/** Defaults favour readability: larger text, Rematch style font. */
const DEFAULTS: Settings = { fontSize: "large", spacing: "normal", font: "default" };

const FONT: Record<FontSize, string> = { normal: "100%", large: "115%", "x-large": "130%" };
const LEADING: Record<Spacing, string> = { normal: "1.6", relaxed: "1.9", loose: "2.25" };
const KEY = "rematch-a11y";

const Ctx = createContext<{ settings: Settings; update: (s: Partial<Settings>) => void } | null>(null);

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

export function A11yProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    // Read persisted preferences after hydration (localStorage is browser-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(load());
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--root-font-size", FONT[settings.fontSize]);
    document.documentElement.style.setProperty("--reading-leading", LEADING[settings.spacing]);
    if (settings.font === "easy") document.documentElement.dataset.font = "easy";
    else delete document.documentElement.dataset.font;
  }, [settings]);

  const update = useCallback((s: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...s };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useA11y() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useA11y outside provider");
  return c;
}

function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold mb-1">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-violet ${
              value === o.value ? "bg-violet-soft border-2 border-violet text-navy" : "bg-white border-line hover:border-violet"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={legend}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Text size and line spacing controls. These are comfort settings, not diagnostic tools. */
export function A11yControls() {
  const { settings, update } = useA11y();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="a11y-panel"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-violet"
      >
        <span aria-hidden="true">Aa</span> Reading settings
      </button>
      {open && (
        <div
          id="a11y-panel"
          role="group"
          aria-label="Reading settings"
          className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-line bg-white p-4 shadow-lg space-y-4 animate-pop"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <Segmented
            legend="Text size"
            value={settings.fontSize}
            onChange={(v) => update({ fontSize: v })}
            options={[
              { value: "normal", label: "Normal" },
              { value: "large", label: "Large" },
              { value: "x-large", label: "Extra large" },
            ]}
          />
          <Segmented
            legend="Line spacing"
            value={settings.spacing}
            onChange={(v) => update({ spacing: v })}
            options={[
              { value: "normal", label: "Normal" },
              { value: "relaxed", label: "Relaxed" },
              { value: "loose", label: "Extra" },
            ]}
          />
          <Segmented
            legend="Font"
            value={settings.font}
            onChange={(v) => update({ font: v })}
            options={[
              { value: "default", label: "Rematch style" },
              { value: "easy", label: "Easy to read" },
            ]}
          />
          <p className="text-xs text-navy-soft">“Easy to read” uses Atkinson Hyperlegible for every word on the page.</p>
          <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

const subscribeNoop = () => () => {};

/** Optional read-aloud using the browser's speech synthesis, with a graceful fallback. */
export function ReadAloudButton({ text, label, onUsed }: { text: string; label: string; onUsed?: () => void }) {
  const supported = useSyncExternalStore(
    subscribeNoop,
    () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
    () => true,
  );
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => {
    if (utterRef.current) window.speechSynthesis?.cancel();
  }, []);

  if (!supported) {
    return (
      <p className="text-sm text-navy-soft" role="note">
        Read-aloud isn&apos;t available in this browser. You can still read at your own pace — there&apos;s no timer.
      </p>
    );
  }

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utterRef.current = u;
    synth.speak(u);
    setSpeaking(true);
    onUsed?.();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className="inline-flex items-center gap-2 rounded-full border border-violet/40 bg-violet-soft px-3 py-1.5 text-sm font-medium text-violet-strong hover:bg-white"
    >
      <span aria-hidden="true">{speaking ? "■" : "🔊"}</span>
      {speaking ? "Stop reading" : label}
    </button>
  );
}
