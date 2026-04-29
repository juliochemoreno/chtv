import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, AlertCircle, Save, Plus } from 'lucide-react';
import { api } from '../../services/api';
import LogoField from '../../components/LogoPicker/LogoField';
import styles from './Admin.module.css';

export default function ChannelForm({ onClose, onSuccess, channel = null, apiKey }) {
  const [formData, setFormData] = useState({
    name: '', slug: '', stream_url: '', logo_url: '', category_id: '', is_active: true,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(console.error);
    if (channel) {
      setFormData({
        name: channel.name || '',
        slug: channel.slug || '',
        stream_url: channel.stream_url || '',
        logo_url: channel.logo_url || '',
        category_id: channel.category_id ?? '',
        is_active: channel.is_active !== false,
      });
    }
  }, [channel]);

  const slugify = (s) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const onName = (e) =>
    setFormData((p) => ({ ...p, name: e.target.value, slug: slugify(e.target.value) }));
  const onChange = (e) =>
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));
  const onCheck = (e) =>
    setFormData((p) => ({ ...p, is_active: e.target.checked }));

  const isValidUrl = (u) => {
    try {
      const x = new URL(u);
      return x.protocol === 'http:' || x.protocol === 'https:';
    } catch { return false; }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.name.trim()) return setError('Nombre requerido');
    if (!formData.slug.trim()) return setError('Slug requerido');
    if (!formData.stream_url.trim() || !isValidUrl(formData.stream_url))
      return setError('URL de stream inválida');
    if (formData.logo_url && !isValidUrl(formData.logo_url))
      return setError('URL del logo inválida');
    if (!formData.category_id) return setError('Selecciona categoría');

    setLoading(true);
    const payload = {
      ...formData,
      category_id: Number(formData.category_id),
      logo_url: formData.logo_url || null,
    };
    try {
      if (channel) await api.updateChannel(channel.id, payload, apiKey);
      else await api.createChannel(payload, apiKey);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Error al guardar');
    } finally { setLoading(false); }
  };

  return (
    <AnimatePresence>
      <motion.div
        className={styles.formOverlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      >
        <motion.div
          className={styles.formContainer}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.formHeader}>
            <div>
              <span className={styles.formKicker}>
                // {channel ? 'EDITAR SEÑAL' : 'NUEVA SEÑAL'}
              </span>
              <h2>{channel ? 'Editar canal' : 'Crear canal'}</h2>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              disabled={loading}
              aria-label="Cerrar"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
            <div className={styles.formBody}>
              <div className={styles.formGroup}>
                <label htmlFor="ch-name">Nombre *</label>
                <input
                  id="ch-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={onName}
                  className={styles.input}
                  disabled={loading}
                  spellCheck="false"
                  autoComplete="off"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="ch-slug">Slug *</label>
                <input
                  id="ch-slug"
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={onChange}
                  className={styles.input}
                  disabled={loading}
                  spellCheck="false"
                  autoComplete="off"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="ch-stream">URL del stream *</label>
                <input
                  id="ch-stream"
                  type="url"
                  name="stream_url"
                  value={formData.stream_url}
                  onChange={onChange}
                  className={styles.input}
                  placeholder="https://example.com/stream.m3u8"
                  disabled={loading}
                  spellCheck="false"
                  autoComplete="off"
                />
              </div>

              <LogoField
                value={formData.logo_url}
                onChange={(url) => setFormData((p) => ({ ...p, logo_url: url }))}
                channelName={formData.name}
                disabled={loading}
              />

              <div className={styles.formGrid2}>
                <div className={styles.formGroup}>
                  <label htmlFor="ch-cat">Categoría *</label>
                  <select
                    id="ch-cat"
                    name="category_id"
                    value={formData.category_id}
                    onChange={onChange}
                    className={styles.input}
                    disabled={loading}
                  >
                    <option value="">Selecciona…</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Estado</label>
                  <label className={styles.formCheckbox}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={onCheck}
                      disabled={loading}
                    />
                    Canal activo
                  </label>
                </div>
              </div>

              {error && (
                <div className={styles.error}>
                  <AlertCircle size={14} strokeWidth={2.4} />
                  {error}
                </div>
              )}
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={onClose}
                disabled={loading}
              >
                Cancelar
              </button>
              <button type="submit" className={styles.button} disabled={loading}>
                {channel
                  ? <><Save size={12} strokeWidth={2.6} />{loading ? 'Guardando…' : 'Actualizar'}</>
                  : <><Plus size={12} strokeWidth={2.6} />{loading ? 'Creando…' : 'Crear'}</>}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
