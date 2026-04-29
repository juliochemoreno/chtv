import styles from './LoadingSpinner.module.css';

export default function LoadingSpinner({ label = 'Inicializando señal' }) {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={styles.frame}>
        <div className={styles.bars} aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className={styles.timecode} aria-hidden="true">
          <span>SYS</span>
          <span className={styles.timecodeMain}>INICIO</span>
          <span>·</span>
          <span className={styles.timecodeBlink}>00:00</span>
        </div>
      </div>
      <p className={styles.text}>
        <span className={styles.textPrefix}>//</span>
        {label}
        <span className={styles.dots}><span>.</span><span>.</span><span>.</span></span>
      </p>
    </div>
  );
}
