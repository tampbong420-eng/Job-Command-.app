"use client";

import type { SiteWeatherDTO } from "@/lib/weather";

export function SiteWeather({
  status,
  data,
  address,
}: {
  status: "idle" | "loading" | "ready" | "error";
  data: SiteWeatherDTO | null;
  address: string;
}) {
  if (!address.trim()) {
    return (
      <section className="site-weather" data-green-weather="1">
        <p className="card-label">Site weather</p>
        <p className="command-empty">Drop a property on the card and I’ll pull the hour-by-hour.</p>
      </section>
    );
  }
  if (status === "loading") {
    return (
      <section className="site-weather" data-green-weather="1">
        <p className="card-label">Site weather</p>
        <p className="command-empty">Checking the sky over this job…</p>
      </section>
    );
  }
  if (status === "error" || !data?.current) {
    return (
      <section className="site-weather" data-green-weather="1">
        <p className="card-label">Site weather</p>
        <p className="command-empty">Couldn’t reach a forecast. Try again when the phone has signal.</p>
      </section>
    );
  }
  const now = data.current;
  return (
    <section className="site-weather" data-green-weather="1">
      <p className="card-label">Site weather</p>
      <div className="site-weather-now">
        <b>{now.tempF}°</b>
        <div>
          <strong>{now.label}</strong>
          <span>
            Feels {now.feelsF}° · Wind {now.windMph} mph · Humidity {now.humidity}%
          </span>
        </div>
      </div>
      {data.hourly.length ? (
        <ul className="site-weather-hours" aria-label="Hourly forecast">
          {data.hourly.map((hour) => (
            <li key={hour.at} title={hour.label}>
              <small>{hour.hour}</small>
              <b>{hour.tempF}°</b>
              <span>{hour.precipPct}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="command-empty">Hourly strip comes in with the next refresh.</p>
      )}
    </section>
  );
}
