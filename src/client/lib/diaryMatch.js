// Best-event matcher for the "AHORA TRANSMITIENDO" block.
//
// Matches the active channel against the day's agenda by looking for the
// channel name (whole word) inside the event description or league.
// Stricter than substring to avoid e.g. a channel named "ESPN" matching every
// event whose description mentions "España".
//
// Time window: events that started up to 2h ago or start within next 4h.
// Picks the one closest to "now" (start time difference, abs).

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WINDOW_BEFORE_MIN = 120; // 2h after start
const WINDOW_AFTER_MIN = 240; // 4h before start

export function findEventForChannel(events, channel, now = new Date()) {
  if (!channel?.name) return null;
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return null;

  const channelNorm = normalize(channel.name);
  if (channelNorm.length < 2) return null;
  // \b doesn't always work as expected with unicode/punctuation; use a
  // surrounding non-word lookbehind/ahead to mimic word boundaries safely.
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(channelNorm)}([^a-z0-9]|$)`);

  const currentMin = now.getHours() * 60 + now.getMinutes();
  const candidates = [];

  for (const ev of list) {
    const a = ev?.attributes || {};
    const desc = a.diary_description || '';
    const league = a.country?.data?.attributes?.name || '';
    const haystack = normalize(`${desc} ${league}`);
    if (!re.test(haystack)) continue;

    const hour = a.diary_hour;
    if (!hour) continue;
    const [h, m] = String(hour).split(':').map(Number);
    if (Number.isNaN(h)) continue;
    const eventMin = h * 60 + (Number.isNaN(m) ? 0 : m);

    const diff = eventMin - currentMin;
    if (diff < -WINDOW_BEFORE_MIN || diff > WINDOW_AFTER_MIN) continue;

    candidates.push({
      time: String(hour).slice(0, 5),
      desc: desc.trim(),
      league: league.trim(),
      diff,
      // 'now' if it started in the last 2h (could still be live)
      // 'next' if it starts within next 4h
      status: diff <= 0 ? 'now' : 'next',
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  return candidates[0];
}
