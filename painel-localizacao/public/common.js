// Utilitários compartilhados pelas telas do painel (namespace Ellus para não
// conflitar com funções já existentes em cada página).
(function () {
  const Ellus = {};

  /** Escapa texto para inserir em HTML (nomes vêm de planilhas importadas). */
  Ellus.esc = function (valor) {
    return String(valor === undefined || valor === null ? '' : valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  Ellus.soDigitos = (v) => String(v || '').replace(/\D/g, '');

  Ellus.formatarCPF = function (v) {
    const s = Ellus.soDigitos(v);
    return s.length === 11 ? s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(v || '');
  };

  /** Data de viagem ("AAAA-MM-DD" ou antigo "DD/MM") → "DD/MM/AAAA". */
  Ellus.formatarData = function (v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || '--');
  };

  /** "AAAA-MM-DD" de hoje no fuso do navegador. */
  Ellus.hojeISO = function (deslocamentoDias = 0) {
    const d = new Date();
    d.setDate(d.getDate() + deslocamentoDias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /** Converte string ISO, Date ou Timestamp do Firestore em Date (ou null). */
  Ellus.paraDate = function (v) {
    if (!v) return null;
    if (typeof v === 'object' && (v._seconds || v.seconds)) return new Date((v._seconds || v.seconds) * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  Ellus.formatarHora = function (v) {
    const d = Ellus.paraDate(v);
    if (!d) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  /** "há 5 min", "há 2 h" — null se não houver data. */
  Ellus.tempoDesde = function (v) {
    const d = Ellus.paraDate(v);
    if (!d) return null;
    const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
    return `há ${Math.floor(h / 24)} dia(s)`;
  };

  Ellus.minutosDesde = function (v) {
    const d = Ellus.paraDate(v);
    return d ? (Date.now() - d.getTime()) / 60000 : null;
  };

  Ellus.situacaoLabel = {
    andamento: 'Em andamento',
    futura: 'Futura',
    encerrada: 'Encerrada',
    indefinida: 'Sem data'
  };

  Ellus.toast = function (msg, tipo = 'info') {
    let c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  };

  /** Gera e baixa um CSV (abre direto no Excel em português). */
  Ellus.baixarCSV = function (nomeArquivo, cabecalho, linhas) {
    const cel = (v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
    const conteudo = [cabecalho, ...linhas].map(l => l.map(cel).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  /** Lê/grava preferências de filtro da tela (sobrevive ao F5). */
  Ellus.prefs = {
    ler(chave, padrao) {
      try { const v = localStorage.getItem(`ellus_${chave}`); return v === null ? padrao : JSON.parse(v); }
      catch (e) { return padrao; }
    },
    gravar(chave, valor) {
      try { localStorage.setItem(`ellus_${chave}`, JSON.stringify(valor)); } catch (e) { /* sem storage */ }
    }
  };

  Ellus.usuario = function () {
    try { return JSON.parse(localStorage.getItem('painel_user') || '{}'); } catch (e) { return {}; }
  };

  Ellus.ehAdmin = () => String(Ellus.usuario().perfil || '').toUpperCase() === 'ADMIN';

  window.Ellus = Ellus;
})();
