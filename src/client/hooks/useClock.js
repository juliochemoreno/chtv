import { useEffect, useState } from 'react';

// Re-renders every second with the current Date. Used by the Hero topbar
// to mimic a broadcast control-room timecode.
export default function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
