/**
 * Configuração remota do aplicativo móvel Embarque Ellus.
 *
 * Mantida em memória para leitura rápida a cada GET /api/mobile/sync e
 * persistida no Firestore em `config/mobile_app`.
 * Todos os valores possuem limites min/max (clamp) para evitar que um valor
 * acidental configurado no painel prejudique a operação em campo.
 */

const DEFAULT_APP_CONFIG = Object.freeze({
  // Reconhecimento facial & câmera
  distance_threshold: 0.95,
  enrollment_burst_count: 3,
  enrollment_burst_interval_ms: 350,
  face_cache_ttl_minutes: 5,
  mlkit_min_face_size: 0.05,
  jpeg_quality: 95,
  camera_resolution: 'high', // 'medium' | 'high' | 'veryHigh'
  use_front_camera_recognition: false,
  use_front_camera_enrollment: false,
  show_face_guide: true,

  // Sincronização, escopo de viagens & rede
  sync_interval_seconds: 60,
  sync_dias_antes: Number(process.env.SYNC_DIAS_ANTES || 3),
  sync_dias_depois: Number(process.env.SYNC_DIAS_DEPOIS || 1),
  api_timeout_seconds: 30,
  sync_batch_size: 50,

  // Leitor de QR Code
  qr_cooldown_seconds: 2,

  // Telemetria (Sentry)
  sentry_facial_verbose_logs: false,
  sentry_traces_sample_rate: 0.2,

  // Lembrete de atualização de versão (NÃO bloqueante)
  recommended_version: '5.2.1',
  update_message:
    'Há uma nova versão do aplicativo Embarque Ellus disponível com melhorias de estabilidade e reconhecimento facial. Atualize quando estiver conectado ao Wi-Fi.',
  store_url_android: '',
  store_url_ios: '',
});

let currentConfig = { ...DEFAULT_APP_CONFIG };

function clampNumber(val, min, max, fallback) {
  const num = Number(val);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function clampInt(val, min, max, fallback) {
  return Math.round(clampNumber(val, min, max, fallback));
}

function toBool(val, fallback) {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === 1 || val === '1') return true;
  if (val === 'false' || val === 0 || val === '0') return false;
  return fallback;
}

/**
 * Valida e aplica limites seguros nos campos de configuração do app.
 */
function sanitizarAppConfig(raw = {}, base = currentConfig) {
  const resolucoesValidas = ['medium', 'high', 'veryHigh'];
  const resCandidate = String(raw.camera_resolution ?? base.camera_resolution ?? 'high').trim();

  const versaoCandidate = String(
    raw.recommended_version ?? base.recommended_version ?? DEFAULT_APP_CONFIG.recommended_version
  ).trim();
  const recommendedVersion = /^\d+\.\d+\.\d+$/.test(versaoCandidate)
    ? versaoCandidate
    : base.recommended_version || DEFAULT_APP_CONFIG.recommended_version;

  return {
    distance_threshold: Number(
      clampNumber(raw.distance_threshold, 0.5, 1.4, base.distance_threshold).toFixed(3)
    ),
    enrollment_burst_count: clampInt(
      raw.enrollment_burst_count,
      1,
      5,
      base.enrollment_burst_count
    ),
    enrollment_burst_interval_ms: clampInt(
      raw.enrollment_burst_interval_ms,
      150,
      1500,
      base.enrollment_burst_interval_ms
    ),
    face_cache_ttl_minutes: clampInt(
      raw.face_cache_ttl_minutes,
      1,
      60,
      base.face_cache_ttl_minutes
    ),
    mlkit_min_face_size: Number(
      clampNumber(raw.mlkit_min_face_size, 0.01, 0.3, base.mlkit_min_face_size).toFixed(3)
    ),
    jpeg_quality: clampInt(raw.jpeg_quality, 60, 100, base.jpeg_quality),
    camera_resolution: resolucoesValidas.includes(resCandidate) ? resCandidate : 'high',
    use_front_camera_recognition: toBool(
      raw.use_front_camera_recognition,
      base.use_front_camera_recognition
    ),
    use_front_camera_enrollment: toBool(
      raw.use_front_camera_enrollment,
      base.use_front_camera_enrollment
    ),
    show_face_guide: toBool(raw.show_face_guide, base.show_face_guide),

    sync_interval_seconds: clampInt(
      raw.sync_interval_seconds,
      15,
      600,
      base.sync_interval_seconds
    ),
    sync_dias_antes: clampInt(raw.sync_dias_antes, 0, 30, base.sync_dias_antes),
    sync_dias_depois: clampInt(raw.sync_dias_depois, 0, 15, base.sync_dias_depois),
    api_timeout_seconds: clampInt(raw.api_timeout_seconds, 10, 120, base.api_timeout_seconds),
    sync_batch_size: clampInt(raw.sync_batch_size, 10, 200, base.sync_batch_size),

    qr_cooldown_seconds: clampInt(raw.qr_cooldown_seconds, 1, 10, base.qr_cooldown_seconds),

    sentry_facial_verbose_logs: toBool(
      raw.sentry_facial_verbose_logs,
      base.sentry_facial_verbose_logs
    ),
    sentry_traces_sample_rate: Number(
      clampNumber(raw.sentry_traces_sample_rate, 0.0, 1.0, base.sentry_traces_sample_rate).toFixed(2)
    ),

    recommended_version: recommendedVersion,
    update_message: String(
      raw.update_message ?? base.update_message ?? DEFAULT_APP_CONFIG.update_message
    )
      .trim()
      .slice(0, 500),
    store_url_android: String(raw.store_url_android ?? base.store_url_android ?? '')
      .trim()
      .slice(0, 500),
    store_url_ios: String(raw.store_url_ios ?? base.store_url_ios ?? '')
      .trim()
      .slice(0, 500),
    updated_at: raw.updated_at || base.updated_at || null,
    updated_by: raw.updated_by || base.updated_by || null,
  };
}

function getAppConfig() {
  return { ...currentConfig };
}

function setAppConfig(parcial = {}) {
  currentConfig = sanitizarAppConfig(parcial, currentConfig);
  return getAppConfig();
}

function resetAppConfig() {
  currentConfig = { ...DEFAULT_APP_CONFIG, updated_at: new Date().toISOString() };
  return getAppConfig();
}

async function carregarAppConfigFirestore(db) {
  if (!db || typeof db.collection !== 'function') return getAppConfig();
  try {
    const docRef = db.collection('config').doc('mobile_app');
    const snap = await docRef.get();
    if (snap.exists) {
      currentConfig = sanitizarAppConfig(snap.data() || {}, DEFAULT_APP_CONFIG);
      console.log('⚙️ [AppConfig] Configuração do app carregada do Firestore');
    } else {
      currentConfig = { ...DEFAULT_APP_CONFIG };
    }
  } catch (e) {
    console.warn('⚠️ [AppConfig] Não foi possível carregar config/mobile_app do Firestore:', e.message);
  }
  return getAppConfig();
}

async function salvarAppConfigFirestore(db, novosValores = {}, usuario = '') {
  const agora = new Date().toISOString();
  const novaConfig = sanitizarAppConfig(
    {
      ...novosValores,
      updated_at: agora,
      updated_by: usuario || 'admin',
    },
    currentConfig
  );
  currentConfig = novaConfig;

  if (db && typeof db.collection === 'function') {
    await db.collection('config').doc('mobile_app').set(novaConfig, { merge: true });
  }
  return getAppConfig();
}

module.exports = {
  DEFAULT_APP_CONFIG,
  sanitizarAppConfig,
  getAppConfig,
  setAppConfig,
  resetAppConfig,
  carregarAppConfigFirestore,
  salvarAppConfigFirestore,
};
