# Painel de Localização de Alunos - Ellus

Sistema de monitoramento em tempo real da localização dos alunos durante viagens.

## Funcionalidades

- **Visualização em 3 categorias:**
  - 🛏️ NO QUARTO
  - 🚶 FORA DO QUARTO
  - 🎉 NA BALADA

- **Filtro por viagem:** Filtre alunos por período de viagem (INICIO_VIAGEM + FIM_VIAGEM)
- **Estatísticas em tempo real:** Totais por categoria
- **Auto-atualização:** Atualiza automaticamente a cada 30 segundos
- **Interface responsiva:** Funciona em desktop e mobile

## Pré-requisitos

- Node.js (versão 14 ou superior)
- npm ou yarn
- Acesso ao Google Sheets com os dados dos alunos

## Estrutura da Planilha

A planilha do Google Sheets deve ter a aba **PESSOAS** com as seguintes colunas:

| Coluna | Descrição |
|--------|-----------|
| id | ID único do aluno |
| CPF | CPF do aluno |
| Nome | Nome completo |
| Email | Email do aluno |
| TELEFONE | Telefone de contato |
| embedding | Dados do reconhecimento facial |
| DATA_CADASTRO | Data de cadastro |
| MOVIMENTAÇÃO | Status atual (VOLTOU_AO_QUARTO, SAIU_DO_QUARTO, FOI_PARA_BALADA) |
| INICIO VIAGEM | Data de início da viagem |
| FIM VIAGEM | Data de fim da viagem |

### Status de Movimentação Aceitos

O sistema reconhece os seguintes status na coluna **MOVIMENTAÇÃO**:

**Para "NO QUARTO":**
- `VOLTOU_AO_QUARTO`
- `QUARTO`

**Para "FORA DO QUARTO":**
- `SAIU_DO_QUARTO`
- `FORA_DO_QUARTO`

**Para "NA BALADA":**
- `FOI_PARA_BALADA`
- `BALADA`

## Instalação

### 1. Clone ou baixe o projeto

```bash
cd painel-localizacao
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure a URL do Google Apps Script

#### 3.1. Implante o Google Apps Script

1. Abra seu Google Apps Script no Google Sheets
2. Clique em **Implantar** > **Nova implantação**
3. Escolha **Aplicativo da Web**
4. Configure:
   - **Executar como:** Eu (seu email)
   - **Quem tem acesso:** Qualquer pessoa
5. Clique em **Implantar**
6. Copie a **URL do aplicativo da Web**

#### 3.2. Configure a variável de ambiente

**Opção 1: Criar arquivo .env**

```bash
cp .env.example .env
```

Edite o arquivo `.env` e cole a URL do Google Apps Script:

```
PORT=3000
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec
```

**Opção 2: Definir variável de ambiente diretamente**

```bash
export GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec"
```

## Como Executar

### Modo de Produção

```bash
npm start
```

### Modo de Desenvolvimento (com auto-reload)

```bash
npm run dev
```

O servidor será iniciado em: **http://localhost:3000**

## Uso

1. Acesse **http://localhost:3000** no navegador
2. Selecione uma viagem no filtro (ou deixe "Todas as viagens")
3. Os alunos serão organizados automaticamente nas 3 categorias
4. O painel atualiza automaticamente a cada 30 segundos
5. Clique no botão "🔄 Atualizar" para forçar uma atualização manual

## API Endpoints

O servidor expõe os seguintes endpoints:

### GET /api/pessoas

Retorna todas as pessoas cadastradas na planilha.

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "cpf": "123.456.789-00",
      "nome": "João Silva",
      "email": "joao@example.com",
      "telefone": "(11) 98765-4321",
      "movimentacao": "QUARTO",
      "inicio_viagem": "2025-01-15",
      "fim_viagem": "2025-01-20"
    }
  ],
  "timestamp": "2025-01-18T10:30:00.000Z"
}
```

### GET /api/viagens

Retorna todas as viagens únicas disponíveis.

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "inicio_viagem": "2025-01-15",
      "fim_viagem": "2025-01-20",
      "label": "2025-01-15 até 2025-01-20"
    }
  ]
}
```

### GET /health

Verifica o status do servidor.

**Resposta:**
```json
{
  "status": "OK",
  "timestamp": "2025-01-18T10:30:00.000Z",
  "googleScriptUrl": "Configurado"
}
```

## Estrutura do Projeto

```
painel-localizacao/
├── public/
│   ├── index.html      # Interface do painel
│   ├── style.css       # Estilos
│   └── app.js          # Lógica do frontend
├── server.js           # Servidor Express
├── package.json        # Dependências
├── .env.example        # Exemplo de configuração
└── README.md           # Este arquivo
```

## Troubleshooting

### Erro: "Erro ao conectar com Google Sheets"

**Causa:** A URL do Google Apps Script não está configurada ou está incorreta.

**Solução:**
1. Verifique se você criou o arquivo `.env` ou definiu a variável de ambiente
2. Confirme que a URL está correta
3. Verifique se a implantação do Google Apps Script está ativa

### Erro: "Nenhum aluno aparece no painel"

**Causa:** A planilha pode não ter dados ou a coluna MOVIMENTAÇÃO está vazia.

**Solução:**
1. Verifique se há dados na aba PESSOAS
2. Confirme que a coluna MOVIMENTAÇÃO tem valores válidos
3. Verifique o console do navegador (F12) para ver os logs

### Erro: "CORS"

**Causa:** Problemas de CORS com o Google Apps Script.

**Solução:**
Certifique-se de que o Google Apps Script está implantado com permissão "Qualquer pessoa" tem acesso.

## Customização

### Alterar porta do servidor

Edite o arquivo `.env`:

```
PORT=8080
```

### Alterar intervalo de auto-atualização

Edite o arquivo `public/app.js`, linha com `setInterval`:

```javascript
// Mudar de 30000 (30 segundos) para 60000 (1 minuto)
autoRefreshInterval = setInterval(() => {
  carregarDados(true);
}, 60000);
```

### Personalizar cores

Edite o arquivo `public/style.css` nas seções:
- `.panel-quarto .panel-header` (cor do painel NO QUARTO)
- `.panel-fora .panel-header` (cor do painel FORA DO QUARTO)
- `.panel-balada .panel-header` (cor do painel NA BALADA)

## Licença

MIT

## Suporte

Para dúvidas ou problemas, verifique:
1. Os logs do servidor (terminal onde executou `npm start`)
2. O console do navegador (F12 > Console)
3. A configuração da URL do Google Apps Script
