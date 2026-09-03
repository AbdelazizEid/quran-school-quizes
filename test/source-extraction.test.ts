import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_EXTRACTED_CHARS,
  MAX_SOURCE_FILE_BYTES,
  extractPastedText,
  extractSourceText,
  extractUploadedFile,
  sourceKindForName,
  SourceExtractionError,
} from "../src/server/ai/extract";

function textFile(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

function pdfWithText(body: string): ArrayBuffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${body}) Tj ET`;
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    `4 0 obj<</Length ${stream.length}>>stream`,
    stream,
    "endstream",
    "endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ].join("\n");
  const bytes = new Uint8Array(pdf.length);
  for (let index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index);
  return bytes.buffer;
}

test("supported file types map from file names", () => {
  assert.equal(sourceKindForName("lesson.pdf"), "pdf");
  assert.equal(sourceKindForName("lesson.DOCX"), "docx");
  assert.equal(sourceKindForName("notes.txt"), "txt");
  assert.equal(sourceKindForName("notes.md"), "md");
  assert.equal(sourceKindForName("notes.markdown"), "md");
  assert.equal(sourceKindForName("image.png"), null);
  assert.equal(sourceKindForName("scan.jpg"), null);
  assert.equal(sourceKindForName("archive.zip"), null);
  assert.equal(sourceKindForName("noextension"), null);
});

test("txt and markdown uploads extract their text as-is", async () => {
  const txt = await extractUploadedFile(textFile("آيات.txt", "سورة الفاتحة سبع آيات"));
  assert.equal(txt.kind, "txt");
  assert.equal(txt.text, "سورة الفاتحة سبع آيات");

  const md = await extractUploadedFile(textFile("درس.md", "# أحكام التلاوة\n\nالمد الواجب"));
  assert.equal(md.kind, "md");
  assert.equal(md.text, "# أحكام التلاوة\n\nالمد الواجب");
});

test("a PDF with embedded text extracts its text and a scanned PDF is rejected clearly", async () => {
  const text = await extractSourceText("pdf", pdfWithText("Al-Fatihah has 7 verses"));
  assert.equal(text, "Al-Fatihah has 7 verses");

  const scanned = await extractSourceText("pdf", pdfWithText("                         ")).catch(
    (error: unknown) => error,
  );
  assert(scanned instanceof SourceExtractionError);
  assert.equal((scanned as SourceExtractionError).code, "extraction-empty");
});

test("a corrupted PDF fails with an extraction error instead of partial text", async () => {
  const broken = await extractSourceText("pdf", new TextEncoder().encode("not a pdf at all").buffer).catch(
    (error: unknown) => error,
  );
  assert(broken instanceof SourceExtractionError);
  assert.equal((broken as SourceExtractionError).code, "extraction-failed");
});

test("a minimal DOCX document extracts its paragraph text", async () => {
  const docxBase64 =
    "UEsDBBQAAAAAAAAAAAACxKfsSwEAAEsBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz48VHlwZXMgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvY29udGVudC10eXBlcyI+PERlZmF1bHQgRXh0ZW5zaW9uPSJ4bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi94bWwiLz48T3ZlcnJpZGUgUGFydE5hbWU9Ii93b3JkL2RvY3VtZW50LnhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLmRvY3VtZW50Lm1haW4reG1sIi8+PC9UeXBlcz5QSwMEFAAAAAAAAAAAAJv9N+opAQAAKQEAAAsAAABfcmVscy8ucmVsczw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz48UmVsYXRpb25zaGlwcyB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9yZWxhdGlvbnNoaXBzIj48UmVsYXRpb25zaGlwIElkPSJySWQxIiBUeXBlPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzL29mZmljZURvY3VtZW50IiBUYXJnZXQ9IndvcmQvZG9jdW1lbnQueG1sIi8+PC9SZWxhdGlvbnNoaXBzPlBLAwQUAAAAAAAAAAAAWf+JvvAAAADwAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9InllcyI/Pjx3OmRvY3VtZW50IHhtbG5zOnc9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy93b3JkcHJvY2Vzc2luZ21sLzIwMDYvbWFpbiI+PHc6Ym9keT48dzpwPjx3OnI+PHc6dD7Ys9mI2LHYqSDYp9mE2YHYp9iq2K3YqSDYs9io2Lkg2KLZitin2Ko8L3c6dD48L3c6cj48L3c6cD48L3c6Ym9keT48L3c6ZG9jdW1lbnQ+UEsBAhQAFAAAAAAAAAAAAALEp+xLAQAASwEAABMAAAAAAAAAAAAAAAAAAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAUAAAAAAAAAAAAm/036ikBAAApAQAACwAAAAAAAAAAAAAAAAB8AQAAX3JlbHMvLnJlbHNQSwECFAAUAAAAAAAAAAAAWf+JvvAAAADwAAAAEQAAAAAAAAAAAAAAAADOAgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAA7QMAAAAA";
  const docx = Buffer.from(docxBase64, "base64");
  const text = await extractSourceText("docx", docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength));
  assert.equal(text, "سورة الفاتحة سبع آيات");
});

test("oversized files and oversized extracted text are rejected with clear errors", async () => {
  const oversized = new File([new Uint8Array(MAX_SOURCE_FILE_BYTES + 1)], "big.pdf");
  const tooBig = await extractUploadedFile(oversized).catch((error: unknown) => error);
  assert(tooBig instanceof SourceExtractionError);
  assert.equal((tooBig as SourceExtractionError).code, "source-too-large");

  const longText = new File(["أ".repeat(MAX_EXTRACTED_CHARS + 1)], "كبير.txt");
  const extractedTooBig = await extractUploadedFile(longText).catch((error: unknown) => error);
  assert(extractedTooBig instanceof SourceExtractionError);
  assert.equal((extractedTooBig as SourceExtractionError).code, "extracted-text-too-large");
});

test("unsupported file types and empty content are rejected with clear errors", async () => {
  const unsupported = await extractUploadedFile(new File([Buffer.from("x")], "photo.png")).catch(
    (error: unknown) => error,
  );
  assert(unsupported instanceof SourceExtractionError);
  assert.equal((unsupported as SourceExtractionError).code, "unsupported-source-type");

  const empty = await extractUploadedFile(textFile("فارغ.txt", "   ")).catch((error: unknown) => error);
  assert(empty instanceof SourceExtractionError);
  assert.equal((empty as SourceExtractionError).code, "extraction-empty");

  assert.throws(() => extractPastedText("   "), (error: unknown) => {
    assert(error instanceof SourceExtractionError);
    assert.equal(error.code, "extraction-empty");
    return true;
  });
  assert.equal(extractPastedText(" نص قصير "), "نص قصير");
});
