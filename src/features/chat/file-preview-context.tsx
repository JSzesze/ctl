"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { FileArtifact } from "@/features/chat/file-artifact";

export type FilePreviewContextValue = {
  artifact: FileArtifact | null;
  open: (a: FileArtifact) => void;
  close: () => void;
};

const FilePreviewContext = createContext<FilePreviewContextValue | null>(null);

export function FilePreviewProvider({ children }: { children: ReactNode }) {
  const [artifact, setArtifact] = useState<FileArtifact | null>(null);

  const open = useCallback((a: FileArtifact) => {
    setArtifact(a);
  }, []);

  const close = useCallback(() => {
    setArtifact(null);
  }, []);

  const value = useMemo(
    () => ({
      artifact,
      open,
      close,
    }),
    [artifact, open, close],
  );

  return <FilePreviewContext.Provider value={value}>{children}</FilePreviewContext.Provider>;
}

export function useFilePreview(): FilePreviewContextValue {
  const v = useContext(FilePreviewContext);
  if (!v) {
    throw new Error("useFilePreview must be used within FilePreviewProvider");
  }
  return v;
}

/** Returns null when no provider (e.g. storybook); tool rows skip the Open button. */
export function useFilePreviewOptional(): FilePreviewContextValue | null {
  return useContext(FilePreviewContext);
}
