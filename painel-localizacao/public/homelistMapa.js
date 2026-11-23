/**
 * Parser e cruzamento de Mapa de Camas (CSV) para o Homelist.
 * Funciona no navegador e em Node.js (testes unitários).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomelistMapa = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  /** Remove acentos, pontuação, espaços extras e palavras duplicadas em sequência. */
  function normalizarNome(s) {
    const limpo = String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!limpo) return '';
    const tokens = limpo.split(' ');
    const dedup = [];
    for (const t of tokens) {
      if (dedup[dedup.length - 1] !== t) dedup.push(t);
    }
    return dedup.join(' ');
  }

  function removerCargo(nomeNorm) {
    return nomeNorm.replace(/^PROFESS+OR[A]?\s+/, '').trim();
  }

  function distanciaLevenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = new Array(b.length + 1);
    const curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const custo = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + custo);
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  function similaridade(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const maxLen = Math.max(a.length, b.length);
    return 1 - distanciaLevenshtein(a, b) / maxLen;
  }

  /** Detecta linha de período: "22 a 24/11/2026", "30/11 a 02/12/2026", etc. */
  function extrairPeriodo(texto) {
    const s = String(texto || '');
    // DD/MM/YYYY a DD/MM/YYYY
    let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:a|até|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (m) {
      return {
        inicio: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
        fim: `${m[6]}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`,
        rotulo: m[0]
      };
    }
    // DD/MM a DD/MM/YYYY
    m = s.match(/(\d{1,2})\/(\d{1,2})\s*(?:a|até|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (m) {
      return {
        inicio: `${m[5]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
        fim: `${m[5]}-${m[4].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
        rotulo: m[0]
      };
    }
    // DD a DD/MM/YYYY
    m = s.match(/(\d{1,2})\s*(?:a|até|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (m) {
      const mes = m[3].padStart(2, '0');
      const ano = m[4];
      return {
        inicio: `${ano}-${mes}-${m[1].padStart(2, '0')}`,
        fim: `${ano}-${mes}-${m[2].padStart(2, '0')}`,
        rotulo: m[0]
      };
    }
    return null;
  }

  function dividirLinhaCSV(linha, sep) {
    const out = [];
    let atual = '';
    let emAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"') {
        if (emAspas && linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          emAspas = !emAspas;
        }
      } else if (ch === sep && !emAspas) {
        out.push(atual.trim());
        atual = '';
      } else {
        atual += ch;
      }
    }
    out.push(atual.trim());
    return out;
  }

  function detectarSeparador(texto) {
    const amostra = String(texto || '').split(/\r?\n/).slice(0, 10).join('\n');
    const cont = (ch) => (amostra.match(new RegExp(ch, 'g')) || []).length;
    const tabs = cont('\t');
    const semis = cont(';');
    const commas = cont(',');
    if (tabs > commas && tabs > semis) return '\t';
    if (semis > commas) return ';';
    return ',';
  }

  function ehPlaceholderIgnorado(nome) {
    const n = normalizarNome(nome);
    if (!n) return true;
    if (n === 'VAZIO' || n === 'LIVRE') return true;
    if (/^\d+\s+CAMAS?\b/.test(n)) return true;
    return false;
  }

  function ehEquipe(nome) {
    const n = normalizarNome(nome);
    return /^EQUIPE\b/.test(n);
  }

  /**
   * Lê o CSV do mapa de camas e devolve:
   *  - blocos: lista única de períodos encontrados [{ key, inicio, fim, rotulo }]
   *  - itens: [{ quarto, nome, inicio, fim, blocoKey, ehProfessor, ehEquipe }]
   */
  function parsearMapaCamasCSV(texto) {
    const sep = detectarSeparador(texto);
    const linhas = String(texto || '').split(/\r?\n/).map(l => dividirLinhaCSV(l, sep));

    let grupos = []; // [{ colApto, colNome }]
    let quartosAtivos = [];
    let blocoAtual = { key: 'padrao', inicio: '', fim: '', rotulo: 'Viagem selecionada' };
    const blocosMap = new Map();
    const itens = [];

    for (const cells of linhas) {
      // Verifica se há cabeçalho de período em qualquer célula da linha
      let periodoLinha = null;
      for (const c of cells) {
        const p = extrairPeriodo(c);
        if (p) { periodoLinha = p; break; }
      }
      if (periodoLinha) {
        const key = `${periodoLinha.inicio}|${periodoLinha.fim}`;
        blocoAtual = { key, ...periodoLinha };
        if (!blocosMap.has(key)) blocosMap.set(key, blocoAtual);
        quartosAtivos = quartosAtivos.map(() => null);
        continue;
      }

      // Verifica se é linha de cabeçalho "Aptos | Pessoas"
      const novosGrupos = [];
      for (let i = 0; i < cells.length; i++) {
        if (/^aptos?$/i.test(cells[i]) && /^pessoas?$/i.test(cells[i + 1] || '')) {
          novosGrupos.push({ colApto: i, colNome: i + 2 });
        }
      }
      if (novosGrupos.length > 0) {
        grupos = novosGrupos;
        quartosAtivos = grupos.map(() => null);
        continue;
      }

      // Fallback para CSV simples (Quarto, Nome) sem cabeçalho Aptos/Pessoas
      if (grupos.length === 0) {
        const primeiroApto = cells.findIndex(c => /^\d{2,6}[A-Za-z]?$/.test(c));
        if (primeiroApto !== -1) {
          const temPessoas = /^\d{1,2}$/.test(cells[primeiroApto + 1] || '');
          grupos = [{ colApto: primeiroApto, colNome: primeiroApto + (temPessoas ? 2 : 1) }];
          quartosAtivos = [null];
        } else {
          continue;
        }
      }

      for (let g = 0; g < grupos.length; g++) {
        const { colApto, colNome } = grupos[g];
        const celApto = (cells[colApto] || '').trim();
        const celNome = (cells[colNome] || '').trim();

        if (/^\d+\s*aptos?$/i.test(celApto)) {
          quartosAtivos[g] = null;
          continue;
        }
        if (/^\d{2,6}[A-Za-z]?$/.test(celApto)) {
          quartosAtivos[g] = celApto;
        }

        const quarto = quartosAtivos[g];
        if (!quarto || !celNome || ehPlaceholderIgnorado(celNome)) continue;

        if (!blocosMap.has(blocoAtual.key)) blocosMap.set(blocoAtual.key, blocoAtual);
        const norm = normalizarNome(celNome);
        itens.push({
          quarto,
          nome: celNome,
          nomeNormalizado: norm,
          inicio: blocoAtual.inicio,
          fim: blocoAtual.fim,
          blocoKey: blocoAtual.key,
          ehProfessor: /^PROFESS+OR[A]?\s+/.test(norm),
          ehEquipe: ehEquipe(celNome)
        });
      }
    }

    return {
      blocos: Array.from(blocosMap.values()),
      itens
    };
  }

  /**
   * Pontua o quão bem um nome da planilha casa com um aluno cadastrado.
   * Trata: erro de digitação, palavra colada (DANIELAMARCON), abreviação/omissão de sobrenome do meio.
   */
  function pontuarCasamento(nomePlanilha, nomeAluno) {
    const pSemCargo = removerCargo(normalizarNome(nomePlanilha));
    const aNorm = normalizarNome(nomeAluno);
    if (!pSemCargo || !aNorm) return 0;

    if (pSemCargo === aNorm) return 1.0;
    // Sem espaços (ex: DANIELAMARCON FRATONI vs DANIELA MARCON FRATONI)
    if (pSemCargo.replace(/\s+/g, '') === aNorm.replace(/\s+/g, '')) return 0.97;

    const tokensP = pSemCargo.split(' ');
    const tokensA = aNorm.split(' ');

    // Só primeiro nome (ex: "MIGUEL") — não casa sozinho no passo global;
    // fica para o passo de desambiguação pelo colégio do quarto.
    if (tokensP.length === 1) return 0;

    // Similaridade token a token: cada token da planilha busca o melhor token do aluno
    let soma = 0;
    let primeiroOk = similaridade(tokensP[0], tokensA[0]) >= 0.8;
    for (const tp of tokensP) {
      let melhor = 0;
      for (const ta of tokensA) {
        const s = similaridade(tp, ta);
        if (s > melhor) melhor = s;
      }
      soma += melhor;
    }
    const mediaTokens = soma / tokensP.length;
    const simCompleta = similaridade(pSemCargo, aNorm);
    const base = Math.max(mediaTokens * 0.7 + simCompleta * 0.3, simCompleta);
    return primeiroOk ? base : base * 0.8;
  }

  function prepararCandidatos(alunos) {
    const porCpf = new Map();
    for (const a of (alunos || [])) {
      const cpf = String(a.cpf || '').replace(/\D/g, '');
      if (!cpf || porCpf.has(cpf)) continue;
      porCpf.set(cpf, {
        ...a,
        cpf,
        _norm: normalizarNome(a.nome || a.nome_hospede || '')
      });
    }
    return Array.from(porCpf.values());
  }

  /**
   * Cruza os itens do mapa de camas com os alunos de cada bloco de datas.
   * Regra de desambiguação: quando um nome é só o primeiro nome (ex.: MIGUEL)
   * ou dá empate, usa o colégio dos outros alunos já casados no mesmo quarto.
   *
   * @param {Array} itens - saída de parsearMapaCamasCSV().itens
   * @param {Object<string, Array>} alunosPorBloco - mapa blocoKey -> lista de alunos
   */
  function cruzarMapaComAlunos(itens, alunosPorBloco) {
    const candidatosPorBloco = new Map();
    for (const [k, lista] of Object.entries(alunosPorBloco || {})) {
      candidatosPorBloco.set(k, prepararCandidatos(lista));
    }

    const resultados = itens.map((item) => {
      if (item.ehEquipe) {
        return { ...item, status: 'ignorado', motivo: 'Equipe / não é aluno', aluno: null, candidatos: [] };
      }

      const lista = candidatosPorBloco.get(item.blocoKey) || [];
      const ranqueados = lista
        .map(a => ({ aluno: a, score: pontuarCasamento(item.nome, a._norm) }))
        .filter(r => r.score >= 0.65)
        .sort((a, b) => b.score - a.score);

      const top = ranqueados[0];
      const segundo = ranqueados[1];

      if (top && top.score === 1.0 && (!segundo || segundo.score < 1.0)) {
        return { ...item, status: 'exato', motivo: 'Nome exato', aluno: top.aluno, candidatos: [top.aluno] };
      }
      if (top && top.score >= 0.82 && (!segundo || top.score - segundo.score >= 0.08)) {
        return {
          ...item,
          status: 'aproximado',
          motivo: `Nome parecido (${Math.round(top.score * 100)}%)`,
          aluno: top.aluno,
          candidatos: ranqueados.slice(0, 5).map(r => r.aluno)
        };
      }

      return {
        ...item,
        status: ranqueados.length > 1 ? 'ambiguo' : 'nao_encontrado',
        motivo: item.ehProfessor ? 'Professor (geralmente fora da lista de alunos)' : 'Aguardando verificação',
        aluno: null,
        candidatos: ranqueados.slice(0, 5).map(r => r.aluno)
      };
    });

    // Passo 2: desambiguação pelo colégio dos outros ocupantes do mesmo quarto
    const colegioPorQuarto = new Map();
    for (const r of resultados) {
      if (!r.aluno || !r.aluno.colegio) continue;
      const chave = `${r.blocoKey}::${r.quarto}`;
      if (!colegioPorQuarto.has(chave)) colegioPorQuarto.set(chave, new Map());
      const contagem = colegioPorQuarto.get(chave);
      const col = r.aluno.colegio;
      contagem.set(col, (contagem.get(col) || 0) + 1);
    }

    for (const r of resultados) {
      if (r.aluno || r.status === 'ignorado') continue;
      const chave = `${r.blocoKey}::${r.quarto}`;
      const contagem = colegioPorQuarto.get(chave);
      if (!contagem || contagem.size === 0) continue;

      // Colégio majoritário do quarto
      const colegioQuarto = Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0][0];
      const lista = (candidatosPorBloco.get(r.blocoKey) || []).filter(a => a.colegio === colegioQuarto);
      const nomePlan = removerCargo(r.nomeNormalizado);
      const tokens = nomePlan.split(' ').filter(Boolean);
      if (tokens.length === 0) continue;

      // Se só tem 1 token (ex: "MIGUEL"), busca quem tem esse primeiro nome (ou contém o token) no colégio do quarto
      const compativeis = lista.filter(a => {
        const ta = a._norm.split(' ');
        if (tokens.length === 1) return ta[0] === tokens[0];
        return pontuarCasamento(r.nome, a._norm) >= 0.72;
      });

      if (compativeis.length === 1) {
        r.aluno = compativeis[0];
        r.status = 'por_quarto';
        r.motivo = `Pelo colégio do quarto ${r.quarto} (${colegioQuarto})`;
        r.candidatos = compativeis;
      } else if (compativeis.length > 1) {
        r.status = 'ambiguo';
        r.motivo = `${compativeis.length} opções em ${colegioQuarto}`;
        r.candidatos = compativeis.slice(0, 8);
      } else {
        r.motivo = r.ehProfessor
          ? `Professor não cadastrado em ${colegioQuarto}`
          : `Não encontrado em ${colegioQuarto}`;
        r.candidatos = lista.slice(0, 15);
      }
    }

    return resultados;
  }

  return {
    normalizarNome,
    extrairPeriodo,
    parsearMapaCamasCSV,
    cruzarMapaComAlunos
  };
}));
