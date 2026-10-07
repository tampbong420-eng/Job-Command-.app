"use client";

import gs from "@/components/command/PinSecurity.module.css";

/** The shop's phone number (company or owner phone). Big, plain, phone keypad. Multi-shop B2. */
export function ShopField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <label className={gs.shopField}>
      Shop phone number
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(501) 555-0100"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d()+\- .]/g, "").slice(0, 20))}
        data-pin-shop-input="1"
      />
    </label>
  );
}
