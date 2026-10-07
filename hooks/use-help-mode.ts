"use client";

import { useCallback, useEffect, useState } from "react";
import { helpModeEnabled, persistHelpMode, HELP_MODE_EVENT } from "@/lib/help-mode";

export function useHelpMode() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(helpModeEnabled());
    sync();
    window.addEventListener(HELP_MODE_EVENT, sync);
    return () => window.removeEventListener(HELP_MODE_EVENT, sync);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setOn(next);
    persistHelpMode(next);
  }, []);

  return { on, setEnabled };
}
