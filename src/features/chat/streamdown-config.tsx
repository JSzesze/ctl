"use client";

import type { ComponentProps, ReactNode } from "react";
import { code } from "@streamdown/code";

/**
 * Detect bare URLs and GitHub-style paths in inline code for auto-linking.
 * - `owner/repo` → repo root
 * - `owner/repo/path/to/file.md` → blob/HEAD (GitHub redirects to default branch)
 */
export function detectLink(text: string): string | null {
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return null;

  const threePlus = /^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)\/(.+)$/;
  const mPath = trimmed.match(threePlus);
  if (mPath) {
    const [, owner, repo, rest] = mPath;
    return `https://github.com/${owner}/${repo}/blob/HEAD/${rest}`;
  }

  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return `https://github.com/${trimmed}`;
  }
  return null;
}

function inlineCodeChildrenToString(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) {
    return children.map(inlineCodeChildrenToString).join("");
  }
  return "";
}

const linkClass =
  "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary break-words";

const inlineLinkClass =
  "rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[0.8125rem] text-primary underline decoration-primary/40 underline-offset-2 hover:bg-muted hover:decoration-primary break-all";

const inlineCodeFallbackClass =
  "rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[0.8125rem] text-foreground";

export const streamdownPlugins = { code };

type StreamdownAnchorProps = ComponentProps<"a"> & { node?: unknown };

function StreamdownAnchor({ href, children, className, ...props }: StreamdownAnchorProps) {
  return (
    <a
      {...props}
      href={href ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={className ? `${linkClass} ${className}` : linkClass}
    >
      {children}
    </a>
  );
}

type StreamdownInlineCodeProps = ComponentProps<"code"> & { node?: unknown };

function StreamdownInlineCode({ children, className, ...props }: StreamdownInlineCodeProps) {
  const text = inlineCodeChildrenToString(children);
  const href = detectLink(text);
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={inlineLinkClass}>
        {text}
      </a>
    );
  }
  return (
    <code className={className ? `${inlineCodeFallbackClass} ${className}` : inlineCodeFallbackClass} {...props}>
      {children}
    </code>
  );
}

export const streamdownComponents = {
  a: StreamdownAnchor,
  inlineCode: StreamdownInlineCode,
};
