"use client";

import type { ShopSettings } from "@/lib/session";
import type { Role } from "@/lib/types";

export default function SettingsPage({
  role,
  settings,
  onSettings,
  onReset,
}: {
  role: Role;
  settings: ShopSettings;
  onSettings: (next: ShopSettings) => void;
  onReset: () => void;
}) {
  return (
    <section className="page jobs-board">
      <p className="section-kicker">Settings</p>
      <h1>
        Shop
        <br />
        <strong>Controls.</strong>
      </h1>
      <article className="plate settings-card">
        <label className="settings-field">
          Shop name
          <input
            value={settings.shopName}
            onChange={(event) =>
              onSettings({ ...settings, shopName: event.target.value })
            }
          />
        </label>
        <label className="settings-field">
          Account
          <input
            value={settings.account}
            onChange={(event) =>
              onSettings({ ...settings, account: event.target.value })
            }
          />
        </label>
        <label className="off-toggle settings-toggle">
          <input
            type="checkbox"
            checked={settings.pageAlerts}
            onChange={(event) =>
              onSettings({ ...settings, pageAlerts: event.target.checked })
            }
          />
          Page alerts when crew is on the clock
        </label>
        <p className="board-copy">
          {role === "boss"
            ? "Boss Command keeps the rolodex, maps, and customer cards."
            : "Employee Command is clock, assigned stops, and directions."}
        </p>
        <button type="button" className="ghost-action" onClick={onReset}>
          Reset demo shop
        </button>
      </article>
    </section>
  );
}
