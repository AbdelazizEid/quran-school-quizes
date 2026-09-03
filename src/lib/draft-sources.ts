export type DraftSourceRow = {
  id: string;
  kind: string;
  name: string;
  extractedText: string;
  createdAt: Date;
};

export type DraftSourceMetadata = {
  id: string;
  kind: string;
  name: string;
  charCount: number;
  createdAt: Date;
};

export function sourceMetadata(sources: DraftSourceRow[]): DraftSourceMetadata[] {
  return sources.map((source) => ({
    id: source.id,
    kind: source.kind,
    name: source.name,
    charCount: source.extractedText.length,
    createdAt: source.createdAt,
  }));
}
