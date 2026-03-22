/**
 * Document handling for RAG context.
 * Extracts text from uploaded files and builds context for the LLM.
 */

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface MenuPrice {
  default: number | null;
  small?: number | null;
  medium?: number | null;
  large?: number | null;
  extra_large?: number | null;
}

export interface MenuItem {
  name: string;
  description?: string | null;
  prices: MenuPrice;
  popular?: boolean;
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface StructuredMenu {
  restaurant_name?: string | null;
  categories: MenuCategory[];
}

export interface UploadedDocument {
  id: string;
  name: string;
  content: string;
  type: string;
  menu?: StructuredMenu;
}

const SUPPORTED_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".html", ".log", ".xml", ".yaml", ".yml",
  ".js", ".ts", ".py", ".java", ".go", ".rs", ".rb", ".php", ".sh",
  ".pdf",
  ".jpg", ".jpeg", ".png", ".webp",
]);

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function isSupported(file: File): boolean {
  if (SUPPORTED_TYPES.has(file.type)) return true;
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function isPdf(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

export function isImage(file: File): boolean {
  if (IMAGE_TYPES.has(file.type)) return true;
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

async function extractPdfTextLocal(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
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
    } catch (e) {
      console.warn(`[PDF] Page ${i} extraction failed:`, e);
    }
  }

  return pages.join("\n\n---\n\n");
}

async function extractPdfViaServer(file: File, agentUrl: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const url = `${agentUrl.replace(/\/+$/, "")}/voice-agent/extract-pdf`;
  const res = await fetch(url, { method: "POST", body: formData });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Server PDF extraction failed" }));
    throw new Error(err.error || `Server returned ${res.status}`);
  }

  const data = await res.json();
  if (!data.text) throw new Error("Server returned empty text for PDF");
  return data.text;
}

const MAX_IMAGE_DIMENSION = 2048;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function compressImage(file: File): Promise<File> {
  if (!isImage(file) || file.size <= MAX_IMAGE_BYTES) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            const name = file.name.replace(/\.\w+$/, ".jpg");
            resolve(new File([blob], name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export async function extractMenuFromServer(
  file: File,
  agentUrl: string,
): Promise<{ text: string; menu: StructuredMenu }> {
  const uploadFile = isImage(file) ? await compressImage(file) : file;
  console.log(`[Menu] Uploading ${uploadFile.name} (${(uploadFile.size / 1024).toFixed(0)}KB)`);

  const formData = new FormData();
  formData.append("file", uploadFile);

  const url = `${agentUrl.replace(/\/+$/, "")}/voice-agent/extract-menu`;
  const res = await fetch(url, { method: "POST", body: formData });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Menu extraction failed" }));
    throw new Error(err.error || `Server returned ${res.status}`);
  }

  const data = await res.json();
  if (!data.menu) throw new Error("Server returned empty menu");

  const menu = data.menu as StructuredMenu;
  const text = formatMenuAsText(menu);
  return { text, menu };
}

function formatMenuAsText(menu: StructuredMenu): string {
  const lines: string[] = [];
  if (menu.restaurant_name) lines.push(`# ${menu.restaurant_name} Menu\n`);

  for (const cat of menu.categories) {
    lines.push(`## ${cat.name}`);
    for (const item of cat.items) {
      let price = "";
      if (item.prices.default != null) {
        price = ` — $${item.prices.default.toFixed(2)}`;
      } else {
        const sizes = [];
        if (item.prices.small != null) sizes.push(`S: $${item.prices.small.toFixed(2)}`);
        if (item.prices.medium != null) sizes.push(`M: $${item.prices.medium.toFixed(2)}`);
        if (item.prices.large != null) sizes.push(`L: $${item.prices.large.toFixed(2)}`);
        if (item.prices.extra_large != null) sizes.push(`XL: $${item.prices.extra_large.toFixed(2)}`);
        if (sizes.length) price = ` — ${sizes.join(", ")}`;
      }
      const desc = item.description ? ` (${item.description})` : "";
      const pop = item.popular ? " *" : "";
      lines.push(`- ${item.name}${price}${desc}${pop}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function extractText(file: File, agentUrl?: string): Promise<string> {
  if (!isPdf(file)) return file.text();

  const localText = await extractPdfTextLocal(file).catch(() => "");
  if (localText.trim().length > 50) return localText;

  if (agentUrl) {
    console.log(`[PDF] Local extraction insufficient, using server-side OCR via Gemini...`);
    return extractPdfViaServer(file, agentUrl);
  }

  if (localText.trim()) return localText;
  throw new Error("No readable text found in PDF. Configure Agent URL to enable OCR for scanned PDFs.");
}

export function buildDocumentContext(docs: UploadedDocument[]): string {
  if (docs.length === 0) return "";

  const menuDocs = docs.filter((d) => d.menu);
  const otherDocs = docs.filter((d) => !d.menu);

  let context = "";

  if (menuDocs.length > 0) {
    context += "## Restaurant Menu\n\n";
    context += "IMPORTANT: Only offer items from this menu. Use the exact prices listed below when calling add_to_order. ";
    context += "If an item has size-based pricing, use the price for the size the customer requests.\n\n";

    for (const doc of menuDocs) {
      const truncated =
        doc.content.length > 12000
          ? doc.content.slice(0, 12000) + "\n... [truncated]"
          : doc.content;
      context += truncated + "\n\n";
    }
  }

  if (otherDocs.length > 0) {
    context += "## Reference Documents\n\n";
    context += "Use these documents to answer questions accurately.\n\n";

    for (const doc of otherDocs) {
      const truncated =
        doc.content.length > 8000
          ? doc.content.slice(0, 8000) + "\n... [truncated]"
          : doc.content;
      context += `### ${doc.name}\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
    }
  }

  return context;
}

export function generateId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
