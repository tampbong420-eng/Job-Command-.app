"use client";

import { useMemo } from "react";
import { PAGE_THEME, pageThemeVars, type PagePath } from "@/lib/page-theme";

export function usePageEdge(path: PagePath) {
  const theme = PAGE_THEME[path];
  const vars = useMemo(() => pageThemeVars(theme), [theme.edge, theme.glow, theme.ink]);
  return { theme, vars, path };
}
