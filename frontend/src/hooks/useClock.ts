/** A once-per-second ticking wall-clock string for the video HUD timestamp. */

import { useEffect, useState } from "react";

function format(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function useClock(): string {
  const [now, setNow] = useState(() => format(new Date()));

  useEffect(() => {
    const id = setInterval(() => setNow(format(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}
