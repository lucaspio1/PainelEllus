/**
 * Parser e cruzamento de Mapa de Camas (Excel/CSV) para o Homelist.
 * Formato padrão:
 *   Col A: Aptos (número do quarto)
 *   Col B: Pessoas (capacidade)
 *   Col C: Configuração de camas / observações
 *   Col D: COLÉGIO (na linha do quarto) e Nome do hóspede (nas linhas seguintes)
 *   Col E: SEXO (na linha do quarto) ou observação/cargo (nas linhas seguintes)
 *
 * Mantém compatibilidade com o formato legado (Aptos | Pessoas | Nome lado a lado).
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

  /** Remove prefixos/sufixos de cargo (PROF, PROFESSOR, ACOMPANHANTE, etc.) antes de comparar nomes. */
  function removerCargo(nomeBruto) {
    const semSufixo = String(nomeBruto || '')
      .replace(/\s*\(\s*(?:PROF(?:ESS+OR[A]?)?|M[ÃA]E\s+RESPONS[ÁA]VEL|ACOMPANHANTE)[^)]*\)/gi, ' ')
      .replace(/\s*[-–—]\s*(?:PROF(?:ESS+OR[A]?)?|ACOMPANHANTE)\b.*$/gi, ' ')
      .replace(/\s+PROF(?:ESS+OR[A]?)?$/gi, ' ');
    const norm = normalizarNome(semSufixo);
    return norm.replace(/^PROF(?:ESS+OR[A]?)?\s+/, '').trim();
  }

  function ehTextoProfessor(texto) {
    const s = String(texto || '').trim();
    if (!s) return false;
    return /\bPROF(?:ESS+OR[A]?)?\b/i.test(s)
      || /\bACOMPANHANTE\b/i.test(s)
      || /\bM[ÃA]E\s+RESPONS[ÁA]VEL\b/i.test(s);
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

  /**
   * Reconhece número de quarto (ex.: "1001", "7019", "102A") e corrige
   * decimais gerados por arraste automático no Excel (ex.: "5204.33333333333" -> "5204").
   */
  function parsearNumeroQuarto(cel) {
    const s = String(cel || '').trim();
    if (!s) return null;
    if (/^\d{2,6}[A-Za-z]?$/.test(s)) return s;
    if (/^\d{2,6}\.\d+$/.test(s)) {
      const arred = Math.round(Number(s));
      if (Number.isFinite(arred) && arred >= 10) return String(arred);
    }
    return null;
  }

  function ehLinhaTotalAptos(cel) {
    const s = String(cel || '').trim();
    return /^\d+\s*aptos?$/i.test(s) || /^aptos?\s+\d+$/i.test(s);
  }

  function ehTextoCama(texto) {
    const n = normalizarNome(texto);
    if (!n) return false;
    return /\bCAMAS?\b/.test(n)
      || /^\d+\s*CAMAS?\b/.test(n)
      || /\b(CASAL|SOLTEIRO|AUXILIAR(?:ES)?|COLCHAO|COLCHOES)\b/.test(n);
  }

  function ehPlaceholderIgnorado(nome) {
    const n = normalizarNome(nome);
    if (!n) return true;
    if (/^\d+$/.test(n)) return true;
    if (n === 'VAZIO' || n === 'LIVRE' || n === 'VAGA LIVRE' || n === 'VAGA' || n === 'SEM QUARTO') return true;
    if (/^\d+\s*CAMAS?\b/.test(n)) return true;
    if (/^CAMA\s+(NO|NA|DO|DA|EXTRA)\b/.test(n)) return true;
    if (/^(SEPARAR|COLOCAR|PEGAR|TIRAR)\s+(A\s+)?CAMA\b/.test(n)) return true;
    if (/^COLC?OCAR\s+COLCHAO\b/.test(n) || /^COLCHAO\s+EXTRA\b/.test(n)) return true;
    return false;
  }

  function ehEquipe(nome) {
    const n = normalizarNome(nome);
    return /^EQUIPE\b/.test(n) || n === 'ELLUS';
  }

  /**
   * Detecta se um bloco "Aptos | Pessoas" segue o formato padrão (Col D = Colégio/Nome)
   * ou o formato legado (Col C = Nome diretamente).
   */
  function detectarEstiloGrupo(linhas, idxCabecalho, colApto, proximoColApto) {
    // No formato legado lado a lado, o próximo grupo pode começar logo em colApto + 3
    if (proximoColApto !== -1 && proximoColApto <= colApto + 3) {
      return 'legado';
    }

    // Cabeçalho explícito "COLÉGIO" / "SEXO" na linha anterior ou na própria linha
    for (let r = Math.max(0, idxCabecalho - 1); r <= idxCabecalho; r++) {
      const row = linhas[r] || [];
      if (/^col[eé]gio$/i.test(row[colApto + 3] || '') || /^sexo$/i.test(row[colApto + 4] || '')) {
        return 'padrao';
      }
    }

    // Inspeciona as primeiras linhas de dados do bloco
    let scorePadrao = 0;
    let scoreLegado = 0;
    const limite = Math.min(linhas.length, idxCabecalho + 25);
    for (let r = idxCabecalho + 1; r < limite; r++) {
      const row = linhas[r] || [];
      if (/^aptos?$/i.test(row[colApto] || '')) break;
      const c0 = (row[colApto] || '').trim();
      const c2 = (row[colApto + 2] || '').trim();
      const c3 = (row[colApto + 3] || '').trim();

      if (parsearNumeroQuarto(c0)) {
        if (ehTextoCama(c2) && c3) scorePadrao += 2;
        else if (c2 && !ehTextoCama(c2) && !c3) scoreLegado += 2;
      } else if (!c0) {
        if (c3 && (!c2 || ehTextoCama(c2))) scorePadrao += 2;
        else if (c2 && !c3 && !ehTextoCama(c2)) scoreLegado += 2;
      }
    }

    return scoreLegado > scorePadrao ? 'legado' : 'padrao';
  }

  /**
   * Lê o CSV/planilha do mapa de camas e devolve:
   *  - blocos: lista única de períodos encontrados [{ key, inicio, fim, rotulo }]
   *  - itens: [{ quarto, nome, nomeNormalizado, colegioPlanilha, sexo, inicio, fim, blocoKey, ehProfessor, ehEquipe }]
   */
  function parsearMapaCamasCSV(texto) {
    const sep = detectarSeparador(texto);
    const linhas = String(texto || '').split(/\r?\n/).map(l => dividirLinhaCSV(l, sep));

    let grupos = []; // [{ colApto, colCama, colNome, colSexo, estilo }]
    let quartosAtivos = []; // [{ quarto, colegio, sexo } | null]
    let blocoAtual = { key: 'padrao', inicio: '', fim: '', rotulo: 'Viagem selecionada' };
    const blocosMap = new Map();
    const itens = [];

    for (let rowIdx = 0; rowIdx < linhas.length; rowIdx++) {
      const cells = linhas[rowIdx];

      // Linha totalmente em branco encerra o quarto ativo (evita que anotações finais vazem para o último quarto)
      if (cells.every(c => !c)) {
        quartosAtivos = quartosAtivos.map(() => null);
        continue;
      }

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
      const posAptos = [];
      for (let i = 0; i < cells.length; i++) {
        if (/^aptos?$/i.test(cells[i]) && /^pessoas?$/i.test(cells[i + 1] || '')) {
          posAptos.push(i);
        }
      }
      if (posAptos.length > 0) {
        grupos = posAptos.map((colApto, idx) => {
          const prox = idx + 1 < posAptos.length ? posAptos[idx + 1] : -1;
          const estilo = detectarEstiloGrupo(linhas, rowIdx, colApto, prox);
          return estilo === 'padrao'
            ? { colApto, colCama: colApto + 2, colNome: colApto + 3, colSexo: colApto + 4, estilo }
            : { colApto, colCama: -1, colNome: colApto + 2, colSexo: -1, estilo };
        });
        quartosAtivos = grupos.map(() => null);
        continue;
      }

      // Fallback para CSV simples (Quarto, Nome) sem cabeçalho Aptos/Pessoas
      if (grupos.length === 0) {
        const primeiroApto = cells.findIndex(c => parsearNumeroQuarto(c) !== null);
        if (primeiroApto !== -1) {
          const temPessoas = /^\d{1,2}$/.test(cells[primeiroApto + 1] || '');
          const temCamaECol = temPessoas && ehTextoCama(cells[primeiroApto + 2] || '') && Boolean(cells[primeiroApto + 3]);
          if (temCamaECol) {
            grupos = [{ colApto: primeiroApto, colCama: primeiroApto + 2, colNome: primeiroApto + 3, colSexo: primeiroApto + 4, estilo: 'padrao' }];
          } else {
            grupos = [{ colApto: primeiroApto, colCama: -1, colNome: primeiroApto + (temPessoas ? 2 : 1), colSexo: -1, estilo: 'legado' }];
          }
          quartosAtivos = [null];
        } else {
          continue;
        }
      }

      // Ignora anotações soltas marcadas explicitamente como "SEM QUARTO"
      if (cells.some(c => /^sem\s+quarto$/i.test(c))) {
        continue;
      }

      for (let g = 0; g < grupos.length; g++) {
        const { colApto, colNome, colSexo, estilo } = grupos[g];
        const celApto = (cells[colApto] || '').trim();
        const celNome = (cells[colNome] || '').trim();

        if (ehLinhaTotalAptos(celApto)) {
          // Alguns arquivos colocam "10 aptos" na mesma linha do primeiro hóspede do último quarto (ex.: 6012).
          // Só encerra o quarto ativo se não houver um hóspede válido nessa mesma linha.
          if (!celNome || ehPlaceholderIgnorado(celNome)) {
            quartosAtivos[g] = null;
            continue;
          }
        }

        const numQuarto = parsearNumeroQuarto(celApto);
        if (numQuarto) {
          if (estilo === 'padrao') {
            // Na linha do quarto no formato padrão, Col D é o COLÉGIO e Col E é o SEXO
            const colegioQuarto = celNome;
            const sexoQuarto = colSexo >= 0 ? (cells[colSexo] || '').trim() : '';
            quartosAtivos[g] = { quarto: numQuarto, colegio: colegioQuarto, sexo: sexoQuarto };
            continue;
          } else {
            quartosAtivos[g] = { quarto: numQuarto, colegio: '', sexo: '' };
          }
        }

        const ativo = quartosAtivos[g];
        if (!ativo || !celNome || ehPlaceholderIgnorado(celNome)) continue;

        if (!blocosMap.has(blocoAtual.key)) blocosMap.set(blocoAtual.key, blocoAtual);
        const norm = normalizarNome(celNome);
        const obsExtra = colSexo >= 0 ? `${cells[colSexo] || ''} ${cells[colSexo + 1] || ''}`.trim() : '';
        const quartoDeProfs = /^PROFESS+OR(?:ES|AS)$/i.test(normalizarNome(ativo.colegio));

        itens.push({
          quarto: ativo.quarto,
          nome: celNome,
          nomeNormalizado: norm,
          colegioPlanilha: ativo.colegio || '',
          sexo: ativo.sexo || '',
          inicio: blocoAtual.inicio,
          fim: blocoAtual.fim,
          blocoKey: blocoAtual.key,
          ehProfessor: quartoDeProfs || ehTextoProfessor(celNome) || ehTextoProfessor(obsExtra),
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
    const pSemCargo = removerCargo(nomePlanilha);
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
    const primeiroOk = similaridade(tokensP[0], tokensA[0]) >= 0.8;
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
      const norm = normalizarNome(a.nome || a.nome_hospede || '');
      porCpf.set(cpf, {
        ...a,
        cpf,
        _norm: norm,
        _noSpace: norm.replace(/\s+/g, ''),
        _colegioNorm: normalizarNome(a.colegio || '')
      });
    }
    const lista = Array.from(porCpf.values());
    const porNorm = new Map();
    const porNoSpace = new Map();
    for (const a of lista) {
      if (!a._norm) continue;
      if (!porNorm.has(a._norm)) porNorm.set(a._norm, []);
      porNorm.get(a._norm).push(a);
      if (!porNoSpace.has(a._noSpace)) porNoSpace.set(a._noSpace, []);
      porNoSpace.get(a._noSpace).push(a);
    }
    return { lista, porNorm, porNoSpace };
  }

  /** Tenta encontrar o nome real do colégio no sistema a partir do texto da coluna COLÉGIO da planilha. */
  function encontrarColegioSistema(colegioPlanilha, listaAlunos) {
    const alvo = normalizarNome(colegioPlanilha);
    if (!alvo || /^PROFESS+OR/.test(alvo) || alvo === 'ELLUS') return null;

    const colegiosUnicos = new Map();
    for (const a of listaAlunos) {
      if (a.colegio && !colegiosUnicos.has(a.colegio)) {
        colegiosUnicos.set(a.colegio, a._colegioNorm);
      }
    }

    let melhorCol = null;
    let melhorScore = 0;
    for (const [colReal, colNorm] of colegiosUnicos.entries()) {
      if (!colNorm) continue;
      if (colNorm === alvo) return colReal;
      let score = 0;
      if (colNorm.includes(alvo) || alvo.includes(colNorm)) {
        score = 0.85;
      } else {
        score = similaridade(alvo, colNorm);
      }
      if (score > melhorScore) {
        melhorScore = score;
        melhorCol = colReal;
      }
    }
    return melhorScore >= 0.65 ? melhorCol : null;
  }

  /**
   * Cruza os itens do mapa de camas com os alunos de cada bloco de datas.
   * Regra de desambiguação: quando um nome é só o primeiro nome (ex.: MIGUEL)
   * ou dá empate, usa o colégio dos outros alunos já casados no mesmo quarto
   * (ou, se não houver, a coluna COLÉGIO da própria planilha).
   *
   * @param {Array} itens - saída de parsearMapaCamasCSV().itens
   * @param {Object<string, Array>} alunosPorBloco - mapa blocoKey -> lista de alunos
   */
  function cruzarMapaComAlunos(itens, alunosPorBloco) {
    const blocosIndex = new Map();
    for (const [k, lista] of Object.entries(alunosPorBloco || {})) {
      blocosIndex.set(k, prepararCandidatos(lista));
    }

    const resultados = itens.map((item) => {
      if (item.ehEquipe) {
        return { ...item, status: 'ignorado', motivo: 'Equipe / não é aluno', aluno: null, candidatos: [] };
      }

      const idx = blocosIndex.get(item.blocoKey) || { lista: [], porNorm: new Map(), porNoSpace: new Map() };
      const pSemCargo = removerCargo(item.nome);
      if (!pSemCargo) {
        return { ...item, status: 'nao_encontrado', motivo: 'Nome vazio', aluno: null, candidatos: [] };
      }

      // Caminho rápido O(1): nome exato único
      const exatos = idx.porNorm.get(pSemCargo);
      if (exatos && exatos.length === 1) {
        return { ...item, status: 'exato', motivo: 'Nome exato', aluno: exatos[0], candidatos: [exatos[0]] };
      }

      // Caminho rápido O(1): nome exato sem espaços (ex.: DANIELAMARCON)
      const semEspaco = pSemCargo.replace(/\s+/g, '');
      const exatosNoSpace = idx.porNoSpace.get(semEspaco);
      if (exatosNoSpace && exatosNoSpace.length === 1) {
        return {
          ...item,
          status: 'aproximado',
          motivo: 'Nome parecido (97%)',
          aluno: exatosNoSpace[0],
          candidatos: [exatosNoSpace[0]]
        };
      }

      // Nome com apenas 1 palavra (ex.: "MIGUEL", "Gabriela", "Theo") fica para o passo 2
      if (pSemCargo.indexOf(' ') === -1) {
        return {
          ...item,
          status: 'nao_encontrado',
          motivo: item.ehProfessor ? 'Professor (geralmente fora da lista de alunos)' : 'Aguardando verificação pelo quarto',
          aluno: null,
          candidatos: []
        };
      }

      const ranqueados = idx.lista
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
    // (ou pela coluna COLÉGIO da planilha quando nenhum colega casou ainda)
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
      const idx = blocosIndex.get(r.blocoKey);
      if (!idx) continue;

      const chave = `${r.blocoKey}::${r.quarto}`;
      const contagem = colegioPorQuarto.get(chave);
      let colegioQuarto = null;
      if (contagem && contagem.size > 0) {
        colegioQuarto = Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0][0];
      } else if (r.colegioPlanilha) {
        colegioQuarto = encontrarColegioSistema(r.colegioPlanilha, idx.lista);
      }
      if (!colegioQuarto) continue;

      const lista = idx.lista.filter(a => a.colegio === colegioQuarto);
      const nomePlan = removerCargo(r.nome);
      const tokens = nomePlan.split(' ').filter(Boolean);
      if (tokens.length === 0) continue;

      // Se só tem 1 token (ex: "MIGUEL"), busca quem tem esse primeiro nome no colégio do quarto
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

  /**
   * Retorna as linhas (matriz AOA) do modelo padrão oficial de Mapa de Camas (.xlsx).
   */
  function gerarLinhasModeloPadrao() {
    return [
      ['Standard', '', '', 'COLÉGIO', 'SEXO'],
      ['Aptos', 'Pessoas', '', '', ''],
      [1001, 2, '1 cama de casal.', 'EXEMPLO COLÉGIO A', 'F'],
      ['', '', '', 'MARIA SILVA SOUZA', ''],
      ['', '', '', 'ANA CLARA PEREIRA', ''],
      [1002, 4, '2 cama de casal e 2 auxiliares.', 'EXEMPLO COLÉGIO A', 'F'],
      ['', '', '', 'JULIA SANTOS OLIVEIRA', ''],
      ['', '', '', 'LAURA COSTA LIMA', ''],
      ['', '', '', 'BEATRIZ ALMEIDA ROCHA', ''],
      ['', '', '', 'VAGA LIVRE', ''],
      ['2 aptos', 6, '', '', ''],
      ['Luxo', '', '', '', ''],
      ['Aptos', 'Pessoas', '', '', ''],
      [2001, 4, '2 cama de casal.', 'EXEMPLO COLÉGIO B', 'M'],
      ['', '', '', 'PEDRO HENRIQUE MARTINS', ''],
      ['', '', '', 'LUCAS GABRIEL FERREIRA', ''],
      ['', '', '', 'JOÃO VITOR RIBEIRO', ''],
      ['', '', '', 'MATHEUS CARVALHO DIAS', ''],
      ['1 apto', 4, '', '', '']
    ];
  }

  return {
    normalizarNome,
    removerCargo,
    parsearNumeroQuarto,
    extrairPeriodo,
    parsearMapaCamasCSV,
    cruzarMapaComAlunos,
    gerarLinhasModeloPadrao
  };
}));
