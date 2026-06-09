import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import type { IcsFormSaveMeta } from "./ics-forms-catalog";

const LETTER_W_IN = 8.5;
const LETTER_H_IN = 11;
const MARGIN_IN = 0.35;
const CONTENT_W_IN = LETTER_W_IN - MARGIN_IN * 2;
const CONTENT_H_IN = LETTER_H_IN - MARGIN_IN * 2;

export function icsFormPdfFilename(formNumber: string, formName: string, savedAt: string) {
  const date = savedAt.slice(0, 10);
  const slug = `${formNumber || "form"}-${formName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `ICS-${slug}-${date}.pdf`;
}

function resolveFemaRoot(root: HTMLElement): HTMLElement | null {
  if (root.classList.contains("fema-ics-form")) return root;
  return root.querySelector<HTMLElement>(".fema-ics-form");
}

function prepareCloneForPdf(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add("fema-ics-form--pdf-export");
  clone.style.position = "fixed";
  clone.style.left = "-10000px";
  clone.style.top = "0";
  clone.style.width = `${LETTER_W_IN}in`;
  clone.style.maxWidth = `${LETTER_W_IN}in`;
  clone.style.background = "#fff";
  clone.style.zIndex = "-1";

  clone.querySelectorAll(".fema-ics-form__table-actions").forEach((el) => el.remove());
  clone.querySelectorAll("button").forEach((el) => el.remove());

  clone.querySelectorAll("input, textarea, select").forEach((el) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const value =
      el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
        ? el.checked
          ? "X"
          : ""
        : el.value;
    const block = document.createElement("div");
    block.className = "fema-ics-form__pdf-value";
    block.textContent = value;
    if (el instanceof HTMLTextAreaElement) {
      const lineCount = Math.max(3, value.split("\n").length);
      block.style.minHeight = `${lineCount * 1.35}em`;
    } else {
      block.style.minHeight = "1.2em";
    }
    block.style.whiteSpace = "pre-wrap";
    block.style.borderBottom = "1px solid #000";
    block.style.padding = "2px 4px";
    el.replaceWith(block);
  });

  document.body.appendChild(clone);
  return clone;
}

let measureHost: HTMLDivElement | null = null;

function getMeasureHost(): HTMLDivElement {
  if (!measureHost) {
    measureHost = document.createElement("div");
    measureHost.className = "fema-ics-form--pdf-measure";
    measureHost.style.position = "fixed";
    measureHost.style.left = "-10000px";
    measureHost.style.top = "0";
    measureHost.style.width = `${LETTER_W_IN}in`;
    measureHost.style.visibility = "hidden";
    measureHost.style.pointerEvents = "none";
    document.body.appendChild(measureHost);
  }
  return measureHost;
}

function measureHeight(el: HTMLElement): number {
  const host = getMeasureHost();
  const wrap = document.createElement("section");
  wrap.className = "fema-ics-form__page";
  wrap.appendChild(el);
  host.replaceChildren(wrap);
  return wrap.getBoundingClientRect().height;
}

function inchesToPx(inches: number): number {
  const probe = document.createElement("div");
  probe.style.height = `${inches}in`;
  probe.style.width = `${LETTER_W_IN}in`;
  probe.style.position = "fixed";
  probe.style.left = "-10000px";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const px = probe.offsetHeight;
  probe.remove();
  return px;
}

function getMaxSheetContentHeightPx(banner: HTMLElement | null): number {
  const letterPx = inchesToPx(LETTER_H_IN);
  const bannerPx = banner
    ? measureHeight(banner.cloneNode(true) as HTMLElement)
    : 0;
  return letterPx - bannerPx - 24;
}

function splitTableWrap(tableWrap: HTMLElement): HTMLElement[] {
  const table = tableWrap.querySelector("table.fema-ics-form__table");
  if (!table) return [tableWrap];

  const thead = table.querySelector("thead");
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  if (!thead || bodyRows.length === 0) return [tableWrap];

  return bodyRows.map((tr) => {
    const chunk = document.createElement("div");
    chunk.className = "fema-ics-form__table-wrap fema-ics-form__pdf-table-chunk";
    const t = document.createElement("table");
    t.className = "fema-ics-form__table";
    t.appendChild(thead.cloneNode(true));
    const tbody = document.createElement("tbody");
    tbody.appendChild(tr.cloneNode(true));
    t.appendChild(tbody);
    chunk.appendChild(t);
    return chunk;
  });
}

/** Flatten a logical `.fema-ics-form__page` into indivisible layout blocks. */
function expandPageBlocks(pageEl: HTMLElement): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  const children = Array.from(pageEl.children) as HTMLElement[];

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.classList.contains("fema-ics-form__page-footer")) {
      blocks.push(el);
      continue;
    }
    if (el.classList.contains("fema-ics-form__table-wrap")) {
      const prev = blocks[blocks.length - 1];
      const title =
        prev?.classList.contains("fema-ics-form__block-title") ? blocks.pop() : null;
      const rowChunks = splitTableWrap(el);
      rowChunks.forEach((chunk, idx) => {
        if (idx === 0 && title) blocks.push(title);
        blocks.push(chunk);
      });
      continue;
    }
    blocks.push(el);
  }

  return blocks;
}

function buildPdfSheet(
  banner: HTMLElement | null,
  blocks: HTMLElement[],
  footer: HTMLElement | null,
): HTMLElement {
  const sheet = document.createElement("article");
  sheet.className = "fema-ics-form fema-ics-form--pdf-export fema-ics-form__pdf-sheet";
  sheet.style.width = `${LETTER_W_IN}in`;

  if (banner) sheet.appendChild(banner.cloneNode(true));

  const page = document.createElement("section");
  page.className = "fema-ics-form__page";
  for (const block of blocks) page.appendChild(block.cloneNode(true));
  if (footer) page.appendChild(footer.cloneNode(true));
  sheet.appendChild(page);

  return sheet;
}

/** Pack blocks into letter-height sheets (respects `.fema-ics-form__page` boundaries). */
function buildPdfSheets(femaRoot: HTMLElement): HTMLElement[] {
  const banner = femaRoot.querySelector<HTMLElement>(".fema-ics-form__banner");
  const logicalPages = Array.from(
    femaRoot.querySelectorAll<HTMLElement>(".fema-ics-form__page"),
  );

  if (logicalPages.length === 0) {
    return [femaRoot];
  }

  const maxContentPx = getMaxSheetContentHeightPx(banner);
  const sheets: HTMLElement[] = [];

  for (const logicalPage of logicalPages) {
    const blocks = expandPageBlocks(logicalPage);
    const footer = blocks.find((b) => b.classList.contains("fema-ics-form__page-footer")) ?? null;
    const contentBlocks = blocks.filter((b) => !b.classList.contains("fema-ics-form__page-footer"));

    let chunk: HTMLElement[] = [];
    let chunkHeight = 0;

    const flush = (withFooter: boolean) => {
      if (chunk.length === 0) return;
      sheets.push(buildPdfSheet(banner, chunk, withFooter ? footer : null));
      chunk = [];
      chunkHeight = 0;
    };

    for (const block of contentBlocks) {
      const blockHeight = measureHeight(block.cloneNode(true) as HTMLElement);
      if (chunkHeight + blockHeight > maxContentPx && chunk.length > 0) {
        flush(false);
      }
      chunk.push(block);
      chunkHeight += blockHeight;
    }

    flush(true);
  }

  return sheets;
}

async function canvasForElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: el.scrollWidth,
    height: el.scrollHeight,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });
}

function addCanvasToPdfPage(pdf: jsPDF, canvas: HTMLCanvasElement) {
  const imgData = canvas.toDataURL("image/png", 0.92);
  let imgW = CONTENT_W_IN;
  let imgH = (canvas.height / canvas.width) * imgW;

  if (imgH > CONTENT_H_IN) {
    const scale = CONTENT_H_IN / imgH;
    imgW *= scale;
    imgH = CONTENT_H_IN;
  }

  pdf.addImage(imgData, "PNG", MARGIN_IN, MARGIN_IN, imgW, imgH);
}

function addMetaFooter(pdf: jsPDF, meta: IcsFormSaveMeta) {
  pdf.setFontSize(8);
  pdf.setTextColor(80);
  const line = `Saved ${new Date(meta.savedAt).toLocaleString()} · ${meta.savedBy}${
    meta.savedByEmail ? ` · ${meta.savedByEmail}` : ""
  }`;
  pdf.text(line, MARGIN_IN, LETTER_H_IN - 0.22);
  pdf.setTextColor(0);
}

/** Export rendered FEMA layout to letter-size PDF with proper page breaks. */
export async function exportFemaFormToPdf(
  root: HTMLElement,
  options: { filename: string; meta?: IcsFormSaveMeta },
): Promise<void> {
  const femaRoot = resolveFemaRoot(root);
  if (!femaRoot) throw new Error("No FEMA form layout found to export");

  const clone = prepareCloneForPdf(femaRoot);
  const sheetNodes = buildPdfSheets(clone);
  clone.remove();

  const pdf = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });

  try {
    for (let i = 0; i < sheetNodes.length; i++) {
      const sheet = sheetNodes[i];
      sheet.style.position = "fixed";
      sheet.style.left = "-10000px";
      sheet.style.top = "0";
      document.body.appendChild(sheet);

      try {
        const canvas = await canvasForElement(sheet);
        if (i > 0) pdf.addPage("letter", "portrait");
        addCanvasToPdfPage(pdf, canvas);
        if (options.meta && i === 0) addMetaFooter(pdf, options.meta);
      } finally {
        sheet.remove();
      }
    }

    pdf.save(options.filename);
  } finally {
    measureHost?.remove();
    measureHost = null;
  }
}

/** Plain-text / legacy forms: simple letter PDF with field dump. */
export async function exportLegacyFormTextToPdf(
  title: string,
  body: string,
  options: { filename: string; meta?: IcsFormSaveMeta },
): Promise<void> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });
  const margin = MARGIN_IN;
  const maxW = LETTER_W_IN - margin * 2;
  pdf.setFontSize(14);
  pdf.text(title, margin, margin + 0.2);
  pdf.setFontSize(10);
  let y = margin + 0.55;
  if (options.meta) {
    pdf.setFontSize(8);
    pdf.setTextColor(80);
    pdf.text(
      `Saved ${new Date(options.meta.savedAt).toLocaleString()} · ${options.meta.savedBy}`,
      margin,
      y,
    );
    y += 0.35;
    pdf.setTextColor(0);
    pdf.setFontSize(10);
  }
  const lines = pdf.splitTextToSize(body, maxW);
  for (const line of lines) {
    if (y > LETTER_H_IN - margin) {
      pdf.addPage("letter", "portrait");
      y = margin;
    }
    pdf.text(line, margin, y);
    y += 0.18;
  }
  pdf.save(options.filename);
}

export async function exportIcsFormRecordToPdf(
  getExportRoot: () => HTMLElement | null,
  options: {
    formNumber: string;
    formName: string;
    savedAt: string;
    meta?: IcsFormSaveMeta;
    legacyText?: string;
  },
): Promise<string> {
  const filename = icsFormPdfFilename(options.formNumber, options.formName, options.savedAt);
  const root = getExportRoot();

  if (root && resolveFemaRoot(root)) {
    await exportFemaFormToPdf(root, { filename, meta: options.meta });
    return filename;
  }

  if (options.legacyText?.trim()) {
    await exportLegacyFormTextToPdf(options.formName, options.legacyText, {
      filename,
      meta: options.meta,
    });
    return filename;
  }

  throw new Error("This form cannot be exported to PDF yet. Use a structured ICS template.");
}
