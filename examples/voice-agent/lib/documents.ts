/**
 * Document handling for RAG context.
 * Extracts text from uploaded files and builds context for the LLM.
 */

import * as pdfjsLib from "pdfjs-dist";

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";
}

export interface UploadedDocument {
  id: string;
  name: string;
  content: string;
  type: string;
}

const SUPPORTED_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
  "application/pdf",
]);

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".html", ".log", ".xml", ".yaml", ".yml",
  ".js", ".ts", ".py", ".java", ".go", ".rs", ".rb", ".php", ".sh",
  ".pdf",
]);

export function isSupported(file: File): boolean {
  if (SUPPORTED_TYPES.has(file.type)) return true;
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function isPdf(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let lastY: number | null = null;

      for (const item of content.items) {
        if (!("str" in item)) continue;
        const text = (item as { str: string }).str;
        const transform = (item as { transform?: number[] }).transform;
        const y = transform ? transform[5] : 0;
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lines.push("\n");
        }
        lines.push(text);
        lastY = y;
      }

      const pageText = lines.join("").trim();
      if (pageText) {
        pages.push(pageText);
      }
    } catch {
      pages.push(`[Page ${i}: could not extract text]`);
    }
  }

  if (pages.length === 0) {
    throw new Error("No readable text found in PDF. It may be a scanned image.");
  }

  return pages.join("\n\n---\n\n");
}

export async function extractText(file: File): Promise<string> {
  if (isPdf(file)) return extractPdfText(file);
  return file.text();
}

export function buildDocumentContext(docs: UploadedDocument[]): string {
  if (docs.length === 0) return "";

  let context = "## Reference Documents\n\n";
  context += "The user has provided the following documents. Use them to answer questions accurately. ";
  context += "When you reference information from a document, mention the document name.\n\n";

  for (const doc of docs) {
    const truncated =
      doc.content.length > 8000
        ? doc.content.slice(0, 8000) + "\n... [truncated]"
        : doc.content;
    context += `### ${doc.name}\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
  }

  return context;
}

export function generateId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
