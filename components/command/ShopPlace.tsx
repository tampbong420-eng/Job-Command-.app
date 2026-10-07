"use client";

import { createContext, useContext, type ReactNode } from "react";
import { setShopTimeZone } from "@/lib/dates";

export type ShopPlaceValue = {
  name: string;
  /** Town-level label only ("Tulsa, OK"). */
  place: string;
  lat: number | null;
  lng: number | null;
  timeZone: string;
  /** Trade from sign-up; "" = older shop (painting). */
  trade: string;
};

const NO_SHOP: ShopPlaceValue = { name: "", place: "", lat: null, lng: null, timeZone: "", trade: "" };
const ShopPlaceContext = createContext<ShopPlaceValue>(NO_SHOP);

/**
 * The shop's name, town, rough spot, and clock zone, from its own settings (the root layout reads them).
 * Sets the shop clock (lib/dates.ts) before anything below renders, on the server pass and the phone.
 */
export function ShopPlaceProvider({ value, children }: { value: ShopPlaceValue; children: ReactNode }) {
  setShopTimeZone(value.timeZone || null);
  return <ShopPlaceContext.Provider value={value}>{children}</ShopPlaceContext.Provider>;
}

export function useShopPlace() {
  return useContext(ShopPlaceContext);
}
