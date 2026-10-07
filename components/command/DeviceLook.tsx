"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ShellThemeId } from "@/lib/shell-theme";

type DeviceLook = { accountKey: string | null; choice: ShellThemeId | null };

const DeviceLookContext = createContext<DeviceLook>({ accountKey: null, choice: null });

/** This phone's Dark | Light pick for the signed-in person (read from its cookie on the server). */
export function DeviceLookProvider({
  accountKey,
  choice,
  children,
}: {
  accountKey: string | null;
  choice: ShellThemeId | null;
  children: ReactNode;
}) {
  return <DeviceLookContext.Provider value={{ accountKey, choice }}>{children}</DeviceLookContext.Provider>;
}

export function useDeviceLook() {
  return useContext(DeviceLookContext);
}
