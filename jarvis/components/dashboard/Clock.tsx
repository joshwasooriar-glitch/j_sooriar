"use client";

import { useEffect, useState } from "react";

/**
 * Live clock. Server and browser ICU builds format dates slightly differently,
 * so the server paints the date only and the ticking time appears after mount.
 * Display only; nothing reads this value.
 */
export function Clock({ initialIso, timeZone }: { initialIso: string; timeZone: string }) {
  const [now, setNow] = useState(() => new Date(initialIso));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  })
    .format(now)
    .replace(/,/g, "");

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone,
  })
    .format(now)
    .toLowerCase();

  return (
    <div className="clock">
      <div className="clock-date" suppressHydrationWarning>
        {date}
      </div>
      <div className="clock-time">{mounted ? <time dateTime={now.toISOString()}>{time}</time> : "--:--:--"}</div>
    </div>
  );
}
