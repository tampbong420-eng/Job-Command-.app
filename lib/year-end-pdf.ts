import { jsPDF } from "jspdf";
import { money } from "@/lib/format";
import type { YearEndBooks } from "@/lib/contractor-ledger";

function writeYearEndPdf(books: YearEndBooks) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = 40;

  const ensure = (need = 24) => {
    if (y + need > 740) {
      doc.addPage();
      y = 48;
    }
  };

  const heading = (text: string) => {
    ensure(28);
    y += 10;
    doc.setTextColor(20, 28, 25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text, 40, y);
    y += 16;
  };

  const pair = (label: string, value: string) => {
    ensure(18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 28, 25);
    doc.text(label, 44, y);
    doc.text(value, 560, y, { align: "right" });
    y += 15;
  };

  const wrapped = (text: string, size = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const rows = doc.splitTextToSize(text, 520) as string[];
    rows.forEach((row) => {
      ensure(14);
      doc.text(row, 44, y);
      y += 12;
    });
  };

  const row9 = (text: string) => {
    ensure(14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const rows = doc.splitTextToSize(text, 524) as string[];
    rows.forEach((row) => {
      ensure(12);
      doc.text(row, 44, y);
      y += 11;
    });
  };

  doc.setFillColor(12, 17, 16);
  doc.rect(0, 0, 612, 90, "F");
  doc.setTextColor(212, 162, 74);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("JOB COMMAND", 40, 40);
  doc.setTextColor(232, 239, 233);
  doc.setFontSize(11);
  doc.text("Year-end books for CPA review", 40, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(String(books.year), 400, 40);
  doc.text(`Through ${books.throughDate}`, 400, 58);

  y = 120;
  doc.setTextColor(20, 28, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(books.companyName, 40, y);
  y += 18;
  wrapped("Contractor material-tax ledger · box 1 payroll wages · cash and accrual earnings");
  pair("Generated", books.generatedAt);

  heading("Gross earnings");
  pair("Cash collected (PAID invoices)", money(books.revenue.grossCollected));
  pair("Billed accrual (sent + paid)", money(books.revenue.billedAccrual));
  pair("Labor billed (nontaxable)", money(books.revenue.laborBilled));
  pair("Materials billed (tax basis)", money(books.revenue.materialBilled));
  pair("Other billed (nontaxable)", money(books.revenue.otherBilled));

  heading("Material tax ledger");
  wrapped(books.tax.note);
  pair("Accrued tax on materials", money(books.tax.materialTaxAccrued));
  pair("Accrued tax on labor", money(books.tax.laborTaxAccrued));
  row9(
    "Invoice | Job | Status | Tax rate % | Materials | Labor (nontaxable) | Other (nontaxable) | Accrued material tax | Lump sum"
  );
  books.tax.records.forEach((record) => {
    row9(
      `${record.invoiceNumber} | ${record.jobName} | ${record.status} | ${record.taxRate.toFixed(3)} | ${money(record.materials)} | ${money(record.laborNontaxable)} | ${money(record.otherNontaxable)} | ${money(record.accruedMaterialTax)} | ${record.lumpSum ? "Y" : "N"}`
    );
  });

  heading("Itemized material costs");
  pair("Billed materials", money(books.materials.billed));
  pair("Crew reimbursements", money(books.materials.reimbursed));
  pair("Material cost total", money(books.materials.totalCost));
  row9("Source | Document | Job code | Job | Description | Qty | Unit | Rate | Amount | Tax rate % | Accrued tax");
  books.materials.lines.forEach((item) => {
    row9(
      `${item.source} | ${item.document} | ${item.jobCode} | ${item.jobName} | ${item.description} | ${item.quantity} | ${item.unit} | ${money(item.rate)} | ${money(item.amount)} | ${item.taxRate.toFixed(3)} | ${money(item.accruedTax)}`
    );
  });

  heading("Job ledger");
  row9(
    "Code | Job | Client | Cash collected | Billed accrual | Labor billed (nontaxable) | Materials billed | Materials reimbursed | Material cost | Accrued material tax"
  );
  books.jobs.forEach((job) => {
    row9(
      `${job.code} | ${job.name} | ${job.client} | ${money(job.grossCollected)} | ${money(job.billedAccrual)} | ${money(job.laborBilled)} | ${money(job.materialBilled)} | ${money(job.materialReimbursed)} | ${money(job.materialCost)} | ${money(job.accruedMaterialTax)}`
    );
  });

  heading("Employee payroll wages");
  pair("Gross wages (box 1)", money(books.payroll.grossWages));
  pair("Hours", books.payroll.actualHours.toFixed(1));
  pair("Federal withheld", money(books.payroll.federalWithheld));
  pair("State withheld", money(books.payroll.stateWithheld));
  pair("Reimbursements (not box 1)", money(books.payroll.reimbursements));
  pair("Net payroll", money(books.payroll.net));
  row9(
    "Employee | Title | Status | Hire date | End date | Pay type | Hourly rate | Regular hours | Overtime hours | Gross wages (box 1) | Reimbursements | Deductions | Federal tax | State tax | Net"
  );
  books.payroll.employees.forEach((person) => {
    row9(
      `${person.name} | ${person.title} | ${person.statusLabel} | ${person.hireDate || "—"} | ${person.endDate || "—"} | ${person.payType} | ${money(person.hourlyRate)} | ${person.regularHours.toFixed(1)} | ${person.overtimeHours.toFixed(1)} | ${money(person.grossPay)} | ${money(person.reimbursements)} | ${money(person.deductions)} | ${money(person.federalTax)} | ${money(person.stateTax)} | ${money(person.netPay)}`
    );
  });
  pair("Payroll gross wages (box 1)", money(books.payroll.grossWages));
  pair("Payroll hours total", books.payroll.actualHours.toFixed(1));
  pair("Federal withheld total", money(books.payroll.federalWithheld));
  pair("State withheld total", money(books.payroll.stateWithheld));
  pair("Payroll net total", money(books.payroll.net));

  y += 20;
  ensure(28);
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("Job Command · internal year-end export · not a filed tax return", 40, y);

  return doc.output("arraybuffer");
}

export { writeYearEndPdf };
