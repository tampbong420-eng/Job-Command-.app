import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { isBlobUrl, readUpload } from "@/lib/upload-store";
import path from "path";
import { prisma } from "@/lib/prisma";
import { companyHeading, documentTotals, lineAmount } from "@/lib/documents";
import { formatDay } from "@/lib/dates";
import { money } from "@/lib/format";
import { loadPayrollSettings } from "@/lib/queries";
import { displayJobCode, shopBrand } from "@/lib/shop-brand";
import { rejectRemovedLogin } from "@/lib/live-session";

export const runtime = "nodejs";

async function loadShopLogoBytes(logoUrl?: string | null) {
  const rel = logoUrl?.trim();
  if (!rel || (!rel.startsWith("/") && !isBlobUrl(rel)) || rel.includes("..")) return null;
  const ext = path.extname(rel.split("?")[0]).toLowerCase();
  const format = ext === ".jpg" || ext === ".jpeg" ? "JPEG" : ext === ".png" ? "PNG" : ext === ".webp" ? "WEBP" : null;
  if (!format) return null;
  const data = await readUpload(rel);
  return data ? ({ data, format } as const) : null;
}

export async function GET(request: NextRequest) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const kind = request.nextUrl.searchParams.get("kind");
  const id = request.nextUrl.searchParams.get("id");
  if ((kind !== "estimate" && kind !== "invoice") || !id) {
    return NextResponse.json({ error: "kind and id are required." }, { status: 400 });
  }

  const settings = await loadPayrollSettings();
  const brand = shopBrand(settings);
  const company = brand.name;
  const address = settings.businessAddress.trim() || brand.place;
  const phone = settings.companyPhone || settings.ownerPhone || "";
  const email = settings.ownerEmail || "";
  const logo = await loadShopLogoBytes(brand.logoUrl);

  const view = request.nextUrl.searchParams.get("view") === "1";
  if (kind === "estimate") {
    const estimate = await prisma.estimate.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: "asc" } }, job: true, customer: true },
    });
    if (!estimate) return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
    const customer = estimate.customer;
    const pdf = await drawDocument({
      title: "ESTIMATE",
      number: estimate.number,
      dateLabel: formatDay(estimate.createdAt, "MMM d, yyyy"),
      company,
      address,
      place: brand.place,
      phone,
      email,
      clientName: customer?.name || estimate.job.client,
      clientPhone: customer?.phone || "",
      clientEmail: customer?.email || "",
      clientAddress: customer?.address || estimate.job.address,
      jobName: `${displayJobCode(estimate.job.code, company)} · ${estimate.job.name}`,
      notes: estimate.notes,
      terms: estimate.terms,
      prompt: settings.estimatePrompt,
      taxRate: estimate.taxRate,
      lines: estimate.lines,
      initials: brand.initials,
      logo,
    });
    return pdfResponse(pdf, `${estimate.number}.pdf`, view);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, job: true, customer: true },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const pdf = await drawDocument({
    title: "INVOICE",
    number: invoice.number,
    dateLabel: `Due ${formatDay(invoice.dueDate, "MMM d, yyyy")}`,
    company,
    address,
    place: brand.place,
    phone,
    email,
    clientName: invoice.customer.name,
    clientPhone: invoice.customer.phone,
    clientEmail: invoice.customer.email,
    clientAddress: invoice.customer.address || invoice.job?.address || "",
    jobName: invoice.job ? `${displayJobCode(invoice.job.code, company)} · ${invoice.job.name}` : "Services",
    notes: invoice.notes,
    terms: invoice.terms,
    taxRate: invoice.taxRate,
    lines: invoice.lines,
    initials: brand.initials,
    logo,
  });
  return pdfResponse(pdf, `${invoice.number}.pdf`, view);
}

function pdfResponse(bytes: ArrayBuffer, filename: string, inline = false) {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    },
  });
}

async function drawDocument(input: {
  title: string;
  number: string;
  dateLabel: string;
  company: string;
  address: string;
  /** Town line for the footer ("Tulsa, OK"); empty leaves the footer as just the shop name. */
  place?: string;
  phone: string;
  email: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
  jobName: string;
  notes: string;
  terms: string;
  prompt?: string;
  taxRate: number;
  initials: string;
  logo: { data: Buffer; format: "JPEG" | "PNG" | "WEBP" } | null;
  lines: { kind: string; description: string; quantity: number; unit: string; rate: number }[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const totals = documentTotals(
    input.lines.map((line) => ({
      kind: line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER",
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
    })),
    input.taxRate
  );

  doc.setFillColor(250, 250, 248);
  doc.rect(0, 0, 612, 108, "F");
  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(1.25);
  doc.line(36, 108, 576, 108);

  if (input.logo) {
    try {
      doc.addImage(input.logo.data, input.logo.format, 36, 28, 52, 52);
    } catch {
      /* skip unreadable logo */
    }
  } else {
    doc.setFillColor(17, 17, 17);
    doc.roundedRect(36, 28, 52, 52, 8, 8, "F");
    doc.setTextColor(245, 245, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(input.initials, 62, 58, { align: "center" });
  }

  doc.setTextColor(17, 17, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(companyHeading(input.company), 100, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 82);
  if (input.address) doc.text(input.address, 100, 62);
  const contact = [input.phone, input.email].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, 100, 76);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 17, 17);
  doc.text(input.title, 576, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(82, 82, 82);
  doc.text(input.number, 576, 62, { align: "right" });
  doc.text(input.dateLabel, 576, 76, { align: "right" });

  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PREPARED FOR", 36, 130);
  doc.setFontSize(13);
  doc.text(input.clientName || "Client", 36, 148);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 164;
  for (const line of [input.clientAddress, input.clientPhone, input.clientEmail].filter(Boolean)) {
    doc.text(line, 36, y);
    y += 14;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("JOB", 360, 130);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(input.jobName, 360, 148, { maxWidth: 216 });

  if (input.notes.trim()) {
    y = Math.max(y, 186) + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SCOPE OF WORK", 36, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const notes = doc.splitTextToSize(input.notes, 540);
    doc.text(notes, 36, y + 16);
    y += 16 + notes.length * 13 + 8;
  } else {
    y = Math.max(y, 196) + 16;
  }

  doc.setFillColor(250, 250, 250);
  doc.rect(36, y, 540, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ITEM", 44, y + 15);
  doc.text("QTY", 320, y + 15);
  doc.text("RATE", 390, y + 15);
  doc.text("AMOUNT", 520, y + 15, { align: "right" });
  y += 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const rows = input.lines.length
    ? input.lines
    : [{ kind: "OTHER", description: "Services", quantity: 1, unit: "ea", rate: 0 }];
  for (const line of rows) {
    if (y > 700) {
      doc.addPage();
      y = 48;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(161, 161, 170);
    doc.text(line.kind, 44, y);
    doc.setTextColor(24, 24, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const desc = doc.splitTextToSize(line.description, 250);
    doc.text(desc, 44, y + 12);
    doc.text(`${line.quantity} ${line.unit}`, 320, y + 12);
    doc.text(money(line.rate), 390, y + 12);
    doc.text(money(lineAmount(line)), 576, y + 12, { align: "right" });
    y += Math.max(28, desc.length * 12 + 16);
  }

  y += 8;
  doc.setDrawColor(228, 228, 231);
  doc.line(360, y, 576, y);
  y += 18;
  doc.text("Labor", 400, y);
  doc.text(money(totals.labor), 576, y, { align: "right" });
  y += 16;
  doc.text("Materials", 400, y);
  doc.text(money(totals.materials), 576, y, { align: "right" });
  y += 16;
  doc.text("Subtotal", 400, y);
  doc.text(money(totals.subtotal), 576, y, { align: "right" });
  y += 16;
  doc.text(`Tax (${input.taxRate}%)`, 400, y);
  doc.text(money(totals.tax), 576, y, { align: "right" });
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Total", 400, y);
  doc.text(money(totals.total), 576, y, { align: "right" });

  y += 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PAYMENT TERMS", 36, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const terms = doc.splitTextToSize(input.terms, 540);
  doc.text(terms, 36, y + 16);
  const prompt = input.prompt?.trim();
  if (prompt) {
    y += 16 + terms.length * 12 + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(24, 24, 27);
    doc.text("SPECIAL PROMPT", 36, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const extra = doc.splitTextToSize(prompt, 540);
    doc.text(extra, 36, y + 16);
  }

  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  const footerPlace = input.place || "";
  doc.text(footerPlace ? `${companyHeading(input.company)}  ·  ${footerPlace}` : companyHeading(input.company), 36, 760);

  return doc.output("arraybuffer");
}
