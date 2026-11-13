function getAuthHeaders() {
  const token = localStorage.getItem('painel_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function authFetch(url, options = {}) {
  options.headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  const response = await fetch(url, options);
  if (response.status === 401) {
    localStorage.removeItem('painel_token');
    localStorage.removeItem('painel_user');
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  return response;
}

const CAMPOS_NUMERICOS = [
  'distance_threshold',
  'enrollment_burst_count',
  'enrollment_burst_interval_ms',
  'face_cache_ttl_minutes',
  'mlkit_min_face_size',
  'jpeg_quality',
  'sync_interval_seconds',
  'sync_dias_antes',
  'sync_dias_depois',
  'api_timeout_seconds',
  'sync_batch_size',
  'qr_cooldown_seconds',
  'sentry_traces_sample_rate',
];

const CAMPOS_TEXTO = [
  'camera_resolution',
  'recommended_version',
  'update_message',
  'store_url_android',
  'store_url_ios',
];

const CAMPOS_CHECK = [
  'show_face_guide',
  'use_front_camera_recognition',
  'use_front_camera_enrollment',
  'sentry_facial_verbose_logs',
];

function mostrarToast(msg, ok = true) {
  const el = document.getElementById('statusToast');
  if (!el) return;
  el.textContent = msg;
  el.className = `status-toast ${ok ? 'ok' : 'err'}`;
  setTimeout(() => {
    el.className = 'status-toast';
  }, 4500);
}

function preencherFormulario(cfg) {
  if (!cfg) return;

  for (const id of CAMPOS_NUMERICOS) {
    const el = document.getElementById(id);
    if (el && cfg[id] !== undefined && cfg[id] !== null) {
      el.value = cfg[id];
    }
  }

  for (const id of CAMPOS_TEXTO) {
    const el = document.getElementById(id);
    if (el && cfg[id] !== undefined && cfg[id] !== null) {
      el.value = cfg[id];
    }
  }

  for (const id of CAMPOS_CHECK) {
    const el = document.getElementById(id);
    if (el) {
      el.checked = Boolean(cfg[id]);
    }
  }

  const infoEl = document.getElementById('infoUltimaAtualizacao');
  if (infoEl) {
    if (cfg.updated_at) {
      const dataBr = new Date(cfg.updated_at).toLocaleString('pt-BR');
      infoEl.textContent = `Última atualização: ${dataBr}${cfg.updated_by ? ` por ${cfg.updated_by}` : ''}`;
    } else {
      infoEl.textContent = 'Usando valores padrão do sistema.';
    }
  }
}

async function carregarConfiguracoes() {
  try {
    const res = await authFetch('/api/config/app');
    const json = await res.json();
    if (json.success && json.data) {
      preencherFormulario(json.data);
    } else {
      mostrarToast(json.message || 'Erro ao carregar configurações', false);
    }
  } catch (e) {
    console.error('Erro ao carregar configurações:', e);
    mostrarToast('Erro de conexão ao carregar configurações', false);
  }
}

async function salvarConfiguracoes(event) {
  event.preventDefault();
  const btn = document.getElementById('btnSalvarConfig');
  if (btn) btn.disabled = true;

  try {
    const payload = {};
    for (const id of CAMPOS_NUMERICOS) {
      const el = document.getElementById(id);
      if (el) payload[id] = Number(el.value);
    }
    for (const id of CAMPOS_TEXTO) {
      const el = document.getElementById(id);
      if (el) payload[id] = el.value.trim();
    }
    for (const id of CAMPOS_CHECK) {
      const el = document.getElementById(id);
      if (el) payload[id] = Boolean(el.checked);
    }

    const res = await authFetch('/api/config/app', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (res.ok && json.success) {
      preencherFormulario(json.data);
      mostrarToast('✅ Configurações salvas! Os celulares receberão no próximo sync.', true);
    } else {
      mostrarToast(`❌ ${json.message || 'Sem permissão ou erro ao salvar'}`, false);
    }
  } catch (e) {
    console.error('Erro ao salvar configurações:', e);
    mostrarToast('❌ Erro de conexão ao salvar configurações', false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function restaurarPadrao() {
  if (!confirm('Deseja restaurar todas as configurações do aplicativo para os valores padrão?')) {
    return;
  }
  try {
    const res = await authFetch('/api/config/app/reset', { method: 'POST' });
    const json = await res.json();
    if (res.ok && json.success) {
      preencherFormulario(json.data);
      mostrarToast('✅ Valores padrão restaurados com sucesso!', true);
    } else {
      mostrarToast(`❌ ${json.message || 'Erro ao restaurar padrão'}`, false);
    }
  } catch (e) {
    console.error('Erro ao restaurar padrão:', e);
    mostrarToast('❌ Erro de conexão ao restaurar padrão', false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const userStr = localStorage.getItem('painel_user');
  if (!userStr || !localStorage.getItem('painel_token')) {
    window.location.href = '/login';
    return;
  }
  try {
    const userData = JSON.parse(userStr);
    const nomeEl = document.getElementById('nomeOperador');
    if (nomeEl && userData.nome) {
      const primeiroNome = userData.nome.split(' ')[0].toUpperCase();
      nomeEl.textContent = `👋 Olá, ${primeiroNome}`;
    }
  } catch (_) {}

  carregarConfiguracoes();
});
