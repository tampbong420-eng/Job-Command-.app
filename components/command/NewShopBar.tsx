import gs from "@/components/command/PinSecurity.module.css";

/** Shown under a brand-new shop's setup on a signed-out phone: a way back to the normal sign-in. Multi-shop B2. */
export function NewShopBar() {
  return (
    <nav className={gs.leaveBar} aria-label="Already have a shop" data-new-shop-leave="1">
      <a href="/api/shop/new?leave=1">Already have a shop? Back to sign in</a>
    </nav>
  );
}
