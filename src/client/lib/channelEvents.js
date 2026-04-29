// Broadcast: "the channels collection has changed — anyone caching it should refetch".
// Fired from admin mutations (create/update/delete/sync). Consumed by
// ChannelContext so the public Home/Channels pages refresh without a reload.
export const CHANNELS_CHANGED_EVENT = 'chtv:channels-change';

export function notifyChannelsChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(CHANNELS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
