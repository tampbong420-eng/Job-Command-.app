import { shopBrand, shopOwnerName, type ShopIdentity } from "@/lib/shop-brand";
import type { ReactNode } from "react";

export function BrandMark({
  logoUrl,
  initials,
  name,
  size = "md",
}: {
  logoUrl?: string | null;
  initials: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={`brand-mark brand-mark-${size}`} aria-hidden={!logoUrl}>
      {logoUrl ? (
        <img src={logoUrl} alt={name} />
      ) : (
        <span className="brand-monogram">{initials}</span>
      )}
    </div>
  );
}

export function BrandLockup({
  settings,
  name,
  logoUrl,
  place,
  children,
  compact = false,
}: {
  settings?: ShopIdentity | null;
  name?: string | null;
  logoUrl?: string | null;
  place?: string | null;
  children?: ReactNode;
  compact?: boolean;
}) {
  const brand = shopBrand({
    businessName: name ?? settings?.businessName,
    logoUrl: logoUrl ?? settings?.logoUrl,
    businessAddress: place ?? settings?.businessAddress,
  });
  const owner = shopOwnerName(settings);
  // Universal skin: two-line title stack — first word heavy white, rest neon lime.
  const words = brand.name.trim().split(/\s+/);
  const firstWord = words[0] ?? "";
  const restWords = words.slice(1).join(" ");
  const superLabel = brand.place || owner || "SHOP DESK";
  return (
    <div className={`brand-lockup${compact ? " compact" : ""}`}>
      <span className="skin-micro-slider" aria-hidden="true" />
      <BrandMark logoUrl={brand.logoUrl} initials={brand.initials} name={brand.name} />
      <div className="brand-copy">
        <p className="skin-super">{superLabel}</p>
        <p className="brand-name skin-title-stack">
          <span className="word-white">{firstWord}</span>
          {restWords ? <span className="word-lime">{restWords}</span> : null}
        </p>
        {owner ? <p className="brand-owner">{owner}</p> : null}
        {brand.place ? <p className="brand-place">{brand.place}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function ClientLetterhead({
  settings,
  kicker,
  title,
  children,
}: {
  settings?: ShopIdentity | null;
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  const brand = shopBrand(settings);
  return (
    <header className="client-letterhead">
      <BrandLockup settings={settings} />
      {kicker ? <p className="card-label">{kicker}</p> : null}
      <h1>{title}</h1>
      {children}
      <p className="client-letterhead-shop">
        {brand.name}
        {brand.place ? ` · ${brand.place}` : ""}
      </p>
    </header>
  );
}
