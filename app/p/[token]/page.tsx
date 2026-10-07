import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { inShopOfToken } from "@/lib/shop-of";
import { documentTotals, lineAmount, type LineKind } from "@/lib/documents";
import { money } from "@/lib/format";
import { loadPayrollSettings } from "@/lib/queries";
import { shopCardReady } from "@/lib/send-invoice";
import { clientPayView, shopContactEmail, shopContactPhone } from "@/lib/client-pay";
import { PayClient } from "@/app/p/[token]/PayClient";
import { ClientLetterhead } from "@/components/command/BrandLockup";
import { shopTimeZone } from "@/lib/dates";
import s from "@/app/p/[token]/pay.module.css";

function paidLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: shopTimeZone() });
}

export const dynamic = "force-dynamic";

function dueLabel(date: Date | null | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

async function ClientInvoicePageInShop({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { paid?: string };
}) {
  const token = params.token;
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: { job: true, customer: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) notFound();
  const settings = await loadPayrollSettings();
  const priced = invoice.lines.filter((line) => line.description.trim() && line.rate > 0);
  const totals = documentTotals(
    priced.map((line) => ({
      ...line,
      kind: (line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER") as LineKind,
    })),
    invoice.taxRate
  );
  const total = totals.total || invoice.amount;
  const who = invoice.customer.name;
  const site = invoice.job?.address || invoice.customer.address || "";
  // The platform fee (lib/invoice-split.ts) is between the shop and jobcommand.app. It is
  // never shown to the client: they pay the invoice total, nothing is added on top.
  const view = clientPayView({
    status: invoice.status,
    returnedFromCheckout: searchParams?.paid === "1",
    cardReady: shopCardReady(settings),
  });
  const shopName = settings.businessName.trim() || "the shop";

  return (
    <main className={`client-quote ${s.page}`} data-pay-view={view}>
      <ClientLetterhead settings={settings} kicker="Invoice" title={invoice.number}>
        <p className="client-quote-job">{invoice.job?.name || "Job"}</p>
        <p>{who}</p>
        {site ? <p>{site}</p> : null}
      </ClientLetterhead>
      {invoice.notes.trim() ? (
        <section className="client-quote-scope">
          <p className="card-label">Scope</p>
          <p>{invoice.notes}</p>
        </section>
      ) : null}
      <ul className="client-quote-lines">
        {priced.map((line) => (
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
      <p className="client-quote-total">Total {money(total)}</p>
      {view !== "paid" && invoice.dueDate ? <p className={s.due}>Due {dueLabel(invoice.dueDate)}</p> : null}
      <p className="client-quote-terms">{invoice.terms}</p>
      <PayClient
        token={token}
        view={view}
        total={money(total)}
        shopName={shopName}
        phone={shopContactPhone(settings)}
        email={shopContactEmail(settings)}
        paidOn={invoice.paidAt ? paidLabel(invoice.paidAt) : ""}
      />
    </main>
  );
}

// Signed-out public link: read everything from the shop that owns the link (multi-shop B2).
export default async function ClientInvoicePage(props: { params: { token: string }; searchParams?: { paid?: string } }) {
  return inShopOfToken("invoice", props.params?.token, () => ClientInvoicePageInShop(props));
}
