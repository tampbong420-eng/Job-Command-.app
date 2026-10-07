import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/live-session";
import { can } from "@/lib/access";
import { loadWorkspace } from "@/lib/queries";
import { buildYearEndBooks, parseExportYear } from "@/lib/contractor-ledger";
import { yearEndCsv } from "@/lib/export";
import { writeYearEndPdf } from "@/lib/year-end-pdf";
import { canUseAccountantExport } from "@/lib/billing";

export const runtime = "nodejs";

function allowed() {
  return getLiveSession().then((session) => {
    if (can(session, "company") || can(session, "payroll")) return true;
    return false;
  });
}

export async function GET(request: NextRequest) {
  if (!(await allowed())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const year = parseExportYear(request.nextUrl.searchParams.get("year"));
  const format = (request.nextUrl.searchParams.get("format") || "csv").toLowerCase();
  const workspace = await loadWorkspace();
  if (!canUseAccountantExport(workspace.settings.billing)) {
    return NextResponse.json(
      { error: "subscribe", message: "Active $199/mo or $1,990/yr plan or open trial is required for year-end export." },
      { status: 402 }
    );
  }

  const books = buildYearEndBooks({
    year,
    companyName: workspace.settings.businessName,
    jobs: workspace.jobs,
    invoices: workspace.invoices,
    estimates: workspace.estimates,
    employees: workspace.employees,
  });

  if (format === "pdf") {
    const bytes = writeYearEndPdf(books);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="year-end-${year}.pdf"`,
      },
    });
  }

  const body = yearEndCsv(books);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="year-end-${year}.csv"`,
    },
  });
}
