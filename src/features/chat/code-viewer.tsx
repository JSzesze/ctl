"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import {
  bundledLanguages,
  bundledLanguagesInfo,
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export type CodeViewerProps = {
  code: string;
  /** Lowercase extension without dot (matches `FileArtifact.ext`). */
  language: string;
};

const THEMES = {
  light: "github-light",
  dark: "github-dark",
} as const;

/** Same engine as `@streamdown/code`: JS regex, no Oniguruma WASM. */
const jsEngine = createJavaScriptRegexEngine({ forgiving: true });

/** Alias / id → canonical bundled language id (mirrors `@streamdown/code` alias map, plus each `id`). */
const shikiAliasToId = (() => {
  const m = new Map<string, string>();
  for (const info of bundledLanguagesInfo) {
    m.set(info.id.toLowerCase(), info.id);
    for (const a of info.aliases ?? []) {
      m.set(a.toLowerCase(), info.id);
    }
  }
  return m;
})();

const EXTRA_EXT_ALIASES: Record<string, string> = {
  py: "python",
  sh: "bash",
  yml: "yaml",
  js: "javascript",
  jsx: "javascript",
  env: "dotenv",
};

/**
 * Bounded LRU so long-lived sessions with many distinct languages don't
 * grow an unbounded promise map (each highlighter retains its own grammar state).
 */
const HIGHLIGHTER_CACHE_LIMIT = 12;
const highlighterCache = new Map<string, Promise<Highlighter>>();

function getHighlighterForLang(lang: string): Promise<Highlighter> {
  const existing = highlighterCache.get(lang);
  if (existing) {
    // Refresh recency.
    highlighterCache.delete(lang);
    highlighterCache.set(lang, existing);
    return existing;
  }
  const created = createHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: [lang],
    engine: jsEngine,
  });
  highlighterCache.set(lang, created);
  while (highlighterCache.size > HIGHLIGHTER_CACHE_LIMIT) {
    const oldest = highlighterCache.keys().next();
    if (oldest.done) break;
    const stale = highlighterCache.get(oldest.value);
    highlighterCache.delete(oldest.value);
    // Best-effort disposal — ignore if the highlighter doesn't resolve or lacks `dispose`.
    void Promise.resolve(stale)
      .then((h) => {
        type Disposable = { dispose?: () => void };
        (h as Disposable | undefined)?.dispose?.();
      })
      .catch(() => {});
  }
  return created;
}

/**
 * Map file extension / language hint to a Shiki bundled language id.
 * Falls back to `plaintext` when unknown (same spirit as `@streamdown/code` using `"text"`).
 */
export function extToShikiLang(ext: string): BundledLanguage {
  const e = ext.trim().toLowerCase();
  const pre = EXTRA_EXT_ALIASES[e] ?? e;
  const id = shikiAliasToId.get(pre) ?? pre;
  if (id in bundledLanguages) {
    return id as BundledLanguage;
  }
  return "plaintext" as BundledLanguage;
}

type HtmlStyle = NonNullable<
  Awaited<ReturnType<Highlighter["codeToTokens"]>>["tokens"][number][number]["htmlStyle"]
>;

type HighlightLine = Array<{
  content: string;
  htmlStyle?: HtmlStyle;
}>;

function tokenSpanStyle(s: HtmlStyle | undefined): CSSProperties {
  if (!s) return {};
  const dark =
    typeof (s as Record<string, string>)["--shiki-dark"] === "string"
      ? (s as Record<string, string>)["--shiki-dark"]
      : s.color;
  return {
    ["--shiki-light" as string]: s.color,
    ["--shiki-dark" as string]: dark ?? s.color,
  };
}

function HighlightedLines({ lines }: { lines: HighlightLine[] }) {
  return (
    <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[0.75rem] leading-relaxed">
      <tbody>
        {lines.map((line, lineIndex) => (
          <tr key={lineIndex} className="border-b border-border/30 last:border-b-0">
            <td
              className="sticky left-0 z-[1] w-10 shrink-0 select-none border-r border-border/40 bg-background py-0 pr-2 pl-1 align-top text-right tabular-nums text-muted-foreground"
              aria-hidden
            >
              {lineIndex + 1}
            </td>
            <td className="min-w-0 whitespace-pre py-0 pl-2 align-top">
              {line.length === 0 ? (
                <span className="text-muted-foreground select-none">&nbsp;</span>
              ) : (
                line.map((token, ti) => (
                  <span
                    key={ti}
                    className="[color:var(--shiki-light)] dark:[color:var(--shiki-dark)]"
                    style={tokenSpanStyle(token.htmlStyle)}
                  >
                    {token.content}
                  </span>
                ))
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Highlight with the same stack as `@streamdown/code`: `createHighlighter` + `createJavaScriptRegexEngine`.
 */
async function highlightToLines(code: string, langId: BundledLanguage): Promise<HighlightLine[]> {
  const h = await getHighlighterForLang(langId);
  const loaded = h.getLoadedLanguages();
  const langForTokens = (loaded.includes(langId) ? langId : loaded[0] ?? langId) as BundledLanguage;
  const result = h.codeToTokens(code, {
    lang: langForTokens,
    themes: { light: THEMES.light, dark: THEMES.dark },
  });
  return result.tokens as HighlightLine[];
}

/**
 * Syntax-highlighted code with line numbers (dual-theme: github-light / github-dark).
 * Uses the JavaScript regex engine only — no WASM.
 */
export function CodeViewer({ code, language }: CodeViewerProps) {
  const langId = extToShikiLang(language);
  const [lines, setLines] = useState<HighlightLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadingId = useId();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Debounce so streaming file updates do not run Shiki on every keystroke.
    const debounceMs = 100;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const result = await highlightToLines(code, langId);
          if (!cancelled) setLines(result);
        } catch (e) {
          if (!cancelled) {
            console.error("[CodeViewer] highlight failed:", e);
            setError(e instanceof Error ? e.message : String(e));
          }
        }
      })();
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, langId]);

  if (error) {
    return (
      <pre
        className="min-w-0 whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-muted/20 p-3 font-mono text-[0.75rem] leading-relaxed text-foreground"
        role="alert"
      >
        <span className="text-destructive">Highlight failed: {error}</span>
        {"\n\n"}
        {code}
      </pre>
    );
  }

  if (lines === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-labelledby={loadingId}>
        <span id={loadingId} className="sr-only">
          Loading syntax highlight
        </span>
        <pre className="min-w-0 animate-pulse whitespace-pre-wrap break-words rounded-md border border-border/50 bg-muted/20 p-3 font-mono text-[0.75rem] leading-relaxed text-muted-foreground">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-md border border-border/50 bg-muted/10">
      <div className="min-w-0 overflow-x-auto overscroll-x-contain">
        <HighlightedLines lines={lines} />
      </div>
    </div>
  );
}
