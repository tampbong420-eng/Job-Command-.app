"use client";

import { useState, useTransition } from "react";
import { deleteMyCrewLogin, deleteShopAccount, shopDeletePreview } from "@/app/account-actions";
import {
  CANCEL_STEPS,
  CREW_DELETE_KEEPS,
  CREW_DELETE_LIST,
  DELETE_PHRASE,
  SHOP_DELETE_KEEPS,
  SHOP_DELETE_LIST,
  deletePhraseOk,
} from "@/lib/account-delete-core";
import styles from "./DeleteAccount.module.css";

/** Wipe what this phone kept (offline queue, photo cache, settings) after a delete. Best effort. */
async function forgetThisPhone() {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* private mode */
  }
  try {
    const dbs = (await (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases?.()) || [];
    await Promise.all(
      dbs.map(
        (db) =>
          new Promise<void>((resolve) => {
            if (!db.name) return resolve();
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          })
      )
    );
  } catch {
    /* older Safari: no databases() */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    /* no cache storage */
  }
}

type Who = "shop" | "crew";

function DeletePanel({ who }: { who: Who }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [planLive, setPlanLive] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [shop, setShop] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const list = who === "shop" ? SHOP_DELETE_LIST : CREW_DELETE_LIST;
  const keeps = who === "shop" ? SHOP_DELETE_KEEPS : CREW_DELETE_KEEPS;
  const ready = deletePhraseOk(typed) && (!planLive || cancelled);

  function openPanel() {
    setOpen(true);
    setError("");
    if (who !== "shop") return;
    start(async () => {
      try {
        const preview = await shopDeletePreview();
        setPlanLive(preview.subscriptionLive);
        setShop(preview.shop);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not check your plan.");
      }
    });
  }

  function goToBilling() {
    const billing = document.querySelector<HTMLElement>("[data-billing-desk]");
    billing?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function finish() {
    if (!ready || pending) return;
    setError("");
    start(async () => {
      try {
        if (who === "shop") await deleteShopAccount({ confirm: typed, cancelledPlan: cancelled });
        else await deleteMyCrewLogin({ confirm: typed });
        setDone(true);
        // Clear what this phone kept, but never let a stuck browser store hold the person on this screen.
        await Promise.race([forgetThisPhone(), new Promise((resolve) => window.setTimeout(resolve, 1500))]);
        window.setTimeout(() => window.location.replace("/"), 600);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete. Try again.");
      }
    });
  }

  const title = who === "shop" ? "Delete shop account" : "Delete my login";

  if (done) {
    return (
      <div className={styles.wrap} data-delete-account={who} data-delete-done="1" role="status">
        <p className="card-label">{title}</p>
        <p className={styles.doneLine}>{who === "shop" ? "Your shop is deleted." : "Your login is deleted."}</p>
        <p className={styles.body}>This phone is signed out. Starting over…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap} data-delete-account={who} data-delete-step={open ? "2" : "1"}>
      <p className="card-label">{title}</p>
      {!open ? (
        <>
          <p className={styles.body}>
            {who === "shop"
              ? "Permanently delete your shop and everything in it. This can't be undone."
              : "Permanently delete your sign-in for this shop. This can't be undone."}
          </p>
          <button type="button" className={styles.danger} onClick={openPanel} data-delete-open="1">
            {title}…
          </button>
        </>
      ) : (
        <div className={styles.panel} role="group" aria-label={`${title} — confirm`}>
          <p className={styles.lead}>
            {who === "shop" ? `This deletes ${shop ? `${shop} and ` : ""}everything in it:` : "This deletes:"}
          </p>
          <ul className={styles.list}>
            {list.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={styles.lead}>What stays:</p>
          <ul className={`${styles.list} ${styles.keeps}`}>
            {keeps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          {who === "shop" ? (
            <div className={styles.plan} data-plan-live={planLive ? "1" : "0"}>
              <p className={styles.lead}>{planLive ? "Your paid plan is still on" : "Paid plan"}</p>
              <p className={styles.body}>
                {planLive
                  ? "Deleting the shop does not stop Stripe from charging your card. Cancel the plan first:"
                  : "No paid plan is charging right now. If you ever subscribed, cancel it in Billing first:"}
              </p>
              <ol className={styles.steps}>
                {CANCEL_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <button type="button" className={styles.ghost} onClick={goToBilling}>
                Go to Billing
              </button>
              {planLive ? (
                <label className={styles.check}>
                  <input type="checkbox" checked={cancelled} onChange={(event) => setCancelled(event.target.checked)} />
                  <span>I cancelled my plan in Billing</span>
                </label>
              ) : null}
            </div>
          ) : null}

          <label className={styles.typeLabel} htmlFor={`delete-type-${who}`}>
            Type <b>{DELETE_PHRASE}</b> to confirm
          </label>
          <input
            id={`delete-type-${who}`}
            className={styles.typeBox}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            placeholder={DELETE_PHRASE}
            data-delete-type="1"
          />
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.danger}
            disabled={!ready || pending}
            onClick={finish}
            data-delete-final="1"
          >
            {pending ? "Deleting…" : who === "shop" ? "Delete shop forever" : "Delete my login forever"}
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              setOpen(false);
              setTyped("");
              setCancelled(false);
              setError("");
            }}
          >
            Keep my {who === "shop" ? "shop" : "login"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Company page (office/owner only): delete the whole shop. */
export function DeleteShopAccount() {
  return <DeletePanel who="shop" />;
}

/** Crew phone: delete my own login. */
export function DeleteMyLogin() {
  return <DeletePanel who="crew" />;
}
