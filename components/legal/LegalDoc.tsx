import Link from "next/link";
import type { LegalSection } from "@/lib/legal";
import { LEGAL_EFFECTIVE, LEGAL_OPERATOR, LEGAL_VERSION, legalAnchor } from "@/lib/legal";

export function LegalDoc({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="legal-page">
      <p className="card-label">{LEGAL_OPERATOR}</p>
      <h1>{title}</h1>
      <p className="legal-meta">
        Effective {LEGAL_EFFECTIVE} · Version {LEGAL_VERSION}
      </p>
      <p>{intro}</p>
      <nav className="legal-toc" aria-label="On this page">
        {sections.map((section) => (
          <a key={section.title} href={`#${legalAnchor(section.title)}`}>
            {section.title}
          </a>
        ))}
      </nav>
      {sections.map((section) => (
        <section key={section.title} id={legalAnchor(section.title)} className="legal-section">
          <h2>{section.title}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p key={`${section.title}-${index}`}>{paragraph}</p>
          ))}
        </section>
      ))}
      <nav className="legal-foot">
        <Link href="/terms">Terms & Conditions</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/?tab=company">Company</Link>
        <Link href="/">jobcommand.app</Link>
      </nav>
    </main>
  );
}
