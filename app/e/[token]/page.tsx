import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { inShopOfToken } from "@/lib/shop-of";
import { recordEstimateView } from "@/app/actions";
import { documentTotals, lineAmount, type LineKind } from "@/lib/documents";
import { money } from "@/lib/format";
import { loadPayrollSettings } from "@/lib/queries";
import { parseEstimateStatus } from "@/lib/estimate-status";
import { QuoteClient } from "@/app/e/[token]/QuoteClient";
import { ClientLetterhead } from "@/components/command/BrandLockup";
import { displayJobCode } from "@/lib/shop-brand";

export const dynamic = "force-dynamic";

async function ClientEstimatePageInShop({ params }: { params: { token: string } }) {
  const token = params.token;
  const estimate = await prisma.estimate.findUnique({
    where: { publicToken: token },
    include: { job: true, customer: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) notFound();
  await recordEstimateView(token);
  const fresh = await prisma.estimate.findUnique({
    where: { id: estimate.id },
    include: { job: true, customer: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!fresh) notFound();
  const settings = await loadPayrollSettings();
  const pricedLines = fresh.lines.filter((line) => line.description.trim() && line.rate > 0);
  const totals = documentTotals(
    pricedLines.map((line) => ({
      ...line,
      kind: (line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER") as LineKind,
    })),
    fresh.taxRate
  );
  const status = parseEstimateStatus(fresh.status);
  const who = fresh.customer?.name || fresh.job.client;
  const site = fresh.job.address || fresh.customer?.address || "";

  return (
    <main className="client-quote">
      <ClientLetterhead settings={settings} kicker="Estimate" title={fresh.number}>
        <p className="client-quote-job">{fresh.job.name}</p>
        <p>{who}</p>
        {site ? <p>{site}</p> : null}
        <p>{displayJobCode(fresh.job.code, settings.businessName)}</p>
      </ClientLetterhead>
      {fresh.notes.trim() ? (
        <section className="client-quote-scope">
          <p className="card-label">Scope</p>
          <p>{fresh.notes}</p>
        </section>
      ) : null}
      <ul className="client-quote-lines">
        {pricedLines.map((line) => (
          <li key={line.id}>
            <span>
              {line.kind} · {line.description}
            </span>
            <b>
              {line.quantity} {line.unit} × {money(line.rate)} = {money(lineAmount(line))}
            </b>
          </li>
        ))}
      </ul>
      <p className="client-quote-total">Total {money(totals.total)}</p>
      <p className="client-quote-terms">{fresh.terms}</p>
      {settings.estimatePrompt.trim() ? (
        <section className="client-quote-scope">
          <p className="card-label">Special prompt</p>
          <p>{settings.estimatePrompt}</p>
        </section>
      ) : null}
      <QuoteClient
        token={token}
        status={status}
        signedName={fresh.signedName}
        clientNote={fresh.clientNote}
      />
    </main>
  );
}

// Signed-out public link: read everything from the shop that owns the link (multi-shop B2).
export default async function ClientEstimatePage(props: { params: { token: string } }) {
  return inShopOfToken("estimate", props.params?.token, () => ClientEstimatePageInShop(props));
}
