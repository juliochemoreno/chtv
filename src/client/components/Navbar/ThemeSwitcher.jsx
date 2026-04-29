import { useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';
import { ThemeContext } from '../../context/ThemeContext';
import styles from './ThemeSwitcher.module.css';

export default function ThemeSwitcher() {
  const { theme, themes, setTheme } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  const current = themes.find((t) => t.id === theme) || themes[0];

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDocMouse = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handlePick = (id) => {
    setTheme(id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Tema actual: ${current.label}. Cambiar paleta`}
      >
        <span className={styles.label}>PAL</span>
        <span
          className={styles.swatchFill}
          style={{ backgroundColor: current.swatch }}
          aria-hidden="true"
        />
        <span className={styles.code}>{current.label}</span>
        <ChevronDown
          size={12}
          strokeWidth={2.6}
          className={`${styles.chev} ${open ? styles.chevOpen : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            className={styles.menu}
            role="listbox"
            aria-label="Selector de paleta"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <li className={styles.menuHeader} aria-hidden="true">
              <span>// PALETA</span>
              <span>{themes.length} TEMAS</span>
            </li>
            {themes.map((t, idx) => {
              const active = t.id === theme;
              return (
                <li key={t.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={`${styles.option} ${active ? styles.optionActive : ''}`}
                    onClick={() => handlePick(t.id)}
                  >
                    <span className={styles.optionIndex}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={styles.optionSwatch}
                      style={{ backgroundColor: t.swatch }}
                      aria-hidden="true"
                    />
                    <span className={styles.optionLabel}>{t.label}</span>
                    <span className={styles.optionCheck} aria-hidden="true">
                      {active && <Check size={12} strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
