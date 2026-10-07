"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TOAST_EVENT,
  TOAST_HOLD_MS,
  messageFromUnknown,
  mergeToastStack,
  pushToast,
  type ToastDraft,
  type ToastItem,
  type ToastKind,
} from "@/lib/toast-center";

export type ToastCenterApi = {
  toasts: ToastItem[];
  push: (draft: ToastDraft) => void;
  dismiss: (id: string) => void;
};

export const ToastContext = createContext<ToastCenterApi | null>(null);

export function useToastCenter() {
  const ctx = useContext(ToastContext);
  const push = useCallback(
    (draft: ToastDraft) => {
      if (ctx) ctx.push(draft);
      else pushToast(draft);
    },
    [ctx],
  );
  return {
    toasts: ctx?.toasts ?? [],
    push,
    dismiss: ctx?.dismiss ?? (() => {}),
  };
}

type SonnerData = { description?: unknown } | undefined;

function announce(kind: ToastKind, message: unknown, data?: SonnerData) {
  const title = messageFromUnknown(message);
  if (!title) return;
  pushToast({ kind, title, body: messageFromUnknown(data?.description) });
}

function attachSonnerBridge() {
  if (typeof window === "undefined") return () => {};
  const boxed = window as Window & { __jcToastBridge?: boolean };
  if (boxed.__jcToastBridge) return () => {};
  boxed.__jcToastBridge = true;

  const original = {
    success: toast.success.bind(toast),
    error: toast.error.bind(toast),
    info: toast.info.bind(toast),
    message: toast.message.bind(toast),
    warning: toast.warning.bind(toast),
  };

  toast.success = ((message: unknown, data?: SonnerData) => {
    announce("success", message, data);
    return original.success(message as never, data as never);
  }) as typeof toast.success;
  toast.error = ((message: unknown, data?: SonnerData) => {
    announce("error", message, data);
    return original.error(message as never, data as never);
  }) as typeof toast.error;
  toast.info = ((message: unknown, data?: SonnerData) => {
    announce("info", message, data);
    return original.info(message as never, data as never);
  }) as typeof toast.info;
  toast.message = ((message: unknown, data?: SonnerData) => {
    announce("info", message, data);
    return original.message(message as never, data as never);
  }) as typeof toast.message;
  toast.warning = ((message: unknown, data?: SonnerData) => {
    announce("info", message, data);
    return original.warning(message as never, data as never);
  }) as typeof toast.warning;

  return () => {
    toast.success = original.success;
    toast.error = original.error;
    toast.info = original.info;
    toast.message = original.message;
    toast.warning = original.warning;
    boxed.__jcToastBridge = false;
  };
}

function hideLegacyToaster() {
  const node = document.querySelector<HTMLElement>("[data-sonner-toaster]");
  if (!node) return;
  node.style.setProperty("opacity", "0", "important");
  node.style.setProperty("pointer-events", "none", "important");
  node.style.setProperty("transform", "translateY(-120vh)", "important");
  node.setAttribute("aria-hidden", "true");
}

export function useToastEngine(): ToastCenterApi {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((row) => row.id !== id));
  }, []);

  const push = useCallback((draft: ToastDraft) => {
    pushToast(draft);
  }, []);

  useEffect(() => {
    const timers = new Set<number>();
    function onToast(event: Event) {
      const item = (event as CustomEvent<ToastItem>).detail;
      if (!item?.id || !item.title) return;
      setToasts((list) => mergeToastStack(list, item));
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setToasts((list) => list.filter((row) => row.id !== item.id));
      }, TOAST_HOLD_MS);
      timers.add(timer);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    const detach = attachSonnerBridge();
    hideLegacyToaster();
    const observer = new MutationObserver(hideLegacyToaster);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      detach();
    };
  }, []);

  return useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
}
