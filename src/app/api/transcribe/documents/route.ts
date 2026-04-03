import { NextResponse } from "next/server";
import {
  assertTranscribeProxyTargetAllowed,
  TranscribeProxyTargetError,
} from "@/lib/transcribe-proxy-allow";
import { normalizeTranscribeDocumentList } from "@/lib/transcribe-documents";

export const runtime = "nodejs";

/**
 * Server proxy for the Transcribe HTTP API document list so the browser avoids CORS.
 *
 * Expected upstream (adjust `listPath` in UI if your service differs):
 *   GET {baseUrl}{listPath}  e.g. GET http://127.0.0.1:8787/documents
 * Optional: Authorization: Bearer {apiKey}
 *
 * See your Transcribe repo `docs/http-api.md` for the canonical contract.
 */
type RequestBody = {
  baseUrl?: string;
  listPath?: string;
  apiKey?: string;
};

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const listPathRaw =
    typeof body.listPath === "string" && body.listPath.trim() ? body.listPath.trim() : "/documents";
  const listPath = listPathRaw.startsWith("/") ? listPathRaw : `/${listPathRaw}`;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!baseUrl) {
    return NextResponse.json({ error: "baseUrl is required." }, { status: 400 });
  }

  let target: URL;
  try {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    target = new URL(listPath, base);
  } catch {
    return NextResponse.json({ error: "Could not build request URL from baseUrl and listPath." }, { status: 400 });
  }

  try {
    assertTranscribeProxyTargetAllowed(target);
  } catch (e) {
    const msg = e instanceof TranscribeProxyTargetError ? e.message : "Target not allowed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const headers: HeadersInit = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const text = await upstream.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return NextResponse.json(
        {
          error: "Upstream returned non-JSON.",
          status: upstream.status,
          snippet: text.slice(0, 500),
        },
        { status: 502 },
      );
    }
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: `Upstream HTTP ${upstream.status}`,
        status: upstream.status,
        body: parsed,
      },
      { status: 502 },
    );
  }

  const documents = normalizeTranscribeDocumentList(parsed);

  return NextResponse.json({
    ok: true as const,
    requestedUrl: target.toString(),
    documents,
    raw: parsed,
  });
}
