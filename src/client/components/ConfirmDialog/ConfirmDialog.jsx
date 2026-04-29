import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, AlertTriangle, RefreshCw } from 'lucide-react';
import styles from './ConfirmDialog.module.css';

/**
 * Reusable confirmation dialog in the broadcast aesthetic.
 *
 * Props:
 * - open          (bool)   show/hide
 * - kicker        (str?)   small uppercase label above the title
 * - title         (str)    big Anton title
 * - description   (node?)  body copy (string or JSX)
 * - confirmLabel  (str?)   default "Confirmar"
 * - cancelLabel   (str?)   default "Cancelar"
 * - destructive   (bool?)  red confirm button (for deletes)
 * - loading       (bool?)  disables controls + shows spinner on confirm
 * - onConfirm     (fn)     called on Confirm click
 * - onCancel      (fn)     called on Cancel / overlay / Escape
 */
export default function ConfirmDialog({
  open,
  kicker,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const titleId = useId();

  // Focus the cancel button when opening (safer default than confirm).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => cancelRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape closes (unless we're mid-action)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={loading ? undefined : onCancel}
        >
          <motion.div
            className={`${styles.dialog} ${destructive ? styles.dialogDanger : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              <div>
                {kicker && <span className={styles.kicker}>{kicker}</span>}
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={onCancel}
                disabled={loading}
                aria-label="Cancelar"
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>

            {description && (
              <div className={styles.body}>
                {destructive && (
                  <span className={styles.dangerBadge}>
                    <AlertTriangle size={12} strokeWidth={2.4} />
                    Acción irreversible
                  </span>
                )}
                <div className={styles.description}>{description}</div>
              </div>
            )}

            <div className={styles.actions}>
              <button
                ref={cancelRef}
                type="button"
                className={styles.cancel}
                onClick={onCancel}
                disabled={loading}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`${styles.confirm} ${
                  destructive ? styles.confirmDanger : ''
                }`}
                onClick={onConfirm}
                disabled={loading}
              >
                {loading && (
                  <RefreshCw
                    size={12}
                    strokeWidth={2.4}
                    className={styles.spin}
                  />
                )}
                {loading ? 'Procesando…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
