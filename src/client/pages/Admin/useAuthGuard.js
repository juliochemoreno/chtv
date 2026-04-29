import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Returns a `guard` function that handles auth errors from API responses.
 * If the error has status 401, it clears the stored apiKey, fires the
 * `chtv:auth-change` event so the navbar updates, and redirects to
 * `/admin?expired=1` so the login page can show a "session expired" banner.
 *
 * Wrap any admin API call:
 *   try { await api.someAdminCall(...) }
 *   catch (err) { if (guard(err)) return; throw err; }
 */
export default function useAuthGuard() {
  const navigate = useNavigate();

  return useCallback(
    (err) => {
      if (err?.status === 401) {
        try {
          localStorage.removeItem('apiKey');
          window.dispatchEvent(new Event('chtv:auth-change'));
        } catch {
          /* ignore */
        }
        navigate('/admin?expired=1', { replace: true });
        return true; // handled — caller should stop processing
      }
      return false;
    },
    [navigate],
  );
}
