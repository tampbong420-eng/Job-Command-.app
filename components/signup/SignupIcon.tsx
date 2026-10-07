import { SERVICE_ICON_PATHS, TRADE_ICON_PATHS, UI_ICON_PATHS } from "@/components/signup/icon-paths";

/** 24×24 line icon from the approved mockups. Paths are static constants, never user text. */
export function SignupIcon({ name, className }: { name: string; className?: string }) {
  const d = TRADE_ICON_PATHS[name] || SERVICE_ICON_PATHS[name] || UI_ICON_PATHS[name] || UI_ICON_PATHS.info;
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} dangerouslySetInnerHTML={{ __html: d }} />;
}
