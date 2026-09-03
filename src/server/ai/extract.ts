import { SOURCE_LABEL } from "@/lib/ai-quiz-draft";

export const MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 60_000;

export const SOURCE_KINDS = ["pdf", "docx", "txt", "md", "pasted"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "نص",
  md: "Markdown",
  pasted: "نص ملصق",
};

export type SourceExtractionErrorCode =
  | "unsupported-source-type"
  | "source-too-large"
  | "extracted-text-too-large"
  | "extraction-empty"
  | "extraction-failed";

export class SourceExtractionError extends Error {
  readonly name = "SourceExtractionError";

  constructor(readonly code: SourceExtractionErrorCode) {
    super(`source ${code}`);
  }
}

export function sourceKindForName(fileName: string): SourceKind | null {
  const extension = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  switch (extension) {
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".txt":
      return "txt";
    case ".md":
    case ".markdown":
      return "md";
    default:
      return null;
  }
}

function boundedExtractedText(text: string): string {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) throw new SourceExtractionError("extraction-empty");
  if (trimmed.length > MAX_EXTRACTED_CHARS) throw new SourceExtractionError("extracted-text-too-large");
  return trimmed;
}

export function extractPastedText(text: unknown): string {
  if (typeof text !== "string") throw new SourceExtractionError("extraction-empty");
  return boundedExtractedText(text);
}

export function excerptOf(text: string, length = 160): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= length ? collapsed : `${collapsed.slice(0, length)}…`;
}

export function sourceLabelFor(kind: SourceKind, name: string): string {
  return kind === "pasted" ? SOURCE_LABEL : `${SOURCE_LABEL}: ${name}`;
}

export async function extractSourceText(kind: SourceKind, data: ArrayBuffer): Promise<string> {
  try {
    if (kind === "pdf") {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(data), { mergePages: true });
      const merged = Array.isArray(text) ? text.join("\n") : text;
      if (!merged.trim()) throw new SourceExtractionError("extraction-empty");
      return boundedExtractedText(merged);
    }

    if (kind === "docx") {
      const mammoth = (await import("mammoth")).default;
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
      return boundedExtractedText(value);
    }

    return boundedExtractedText(new TextDecoder("utf-8", { fatal: false }).decode(data));
  } catch (error) {
    if (error instanceof SourceExtractionError) throw error;
    throw new SourceExtractionError("extraction-failed");
  }
}

export async function extractUploadedFile(file: File): Promise<{ kind: SourceKind; name: string; text: string }> {
  const kind = sourceKindForName(file.name);
  if (!kind) throw new SourceExtractionError("unsupported-source-type");
  if (file.size <= 0) throw new SourceExtractionError("extraction-empty");
  if (file.size > MAX_SOURCE_FILE_BYTES) throw new SourceExtractionError("source-too-large");

  const text = await extractSourceText(kind, await file.arrayBuffer());
  return { kind, name: file.name, text };
}
