# 🎯 Painel de Localização de Alunos - Ellus (Versão Robusta + Escalável)

Sistema robusto de gerenciamento e rastreamento de localização de alunos em tempo real, com interface moderna e intuitiva.

**✅ Suporta 1600+ alunos com paginação inteligente**

## 📦 Tecnologias

- **Backend**: Node.js + Express
- **Banco de Dados**: Firebase Firestore
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Deploy**: Google Cloud Platform (Cloud Run ou App Engine)

## ✨ Funcionalidades

### 🎨 Interface Robusta
- **Dashboard em tempo real** com estatísticas atualizadas
- **Cards informativos** exibindo Nome, CPF, Colégio e Turma
- **Design responsivo** e profissional
- **Animações suaves** e feedback visual

### 🔄 Movimentação de Alunos
- **Drag & Drop**: Arraste cards entre painéis para mover alunos
- **Botão "Mover"**: Menu contextual com opções rápidas
- **Modal de Detalhes**: Movimentação direta no modal do aluno
- **3 Localizações disponíveis**:
  - 🛏️ **Quarto**
  - 🚶 **Fora do Quarto**
  - 🎉 **Balada**

### 📊 Recursos Avançados
- **Pesquisa em tempo real** por nome ou CPF (com debounce de 300ms)
- **Filtro por viagem** (início e fim)
- **Histórico completo** de movimentações de cada aluno
- **Auto-refresh** a cada 30 segundos
- **Notificações toast** para feedback de ações
- **Atalhos de teclado** (ESC para fechar modal, F5 para atualizar)

### ⚡ Performance e Escalabilidade
- **Paginação automática**: Renderiza apenas 50 alunos por painel
- **Suporta 1600+ alunos** sem travamentos
- **Debounce na pesquisa**: 300ms para evitar renderizações excessivas
- **Navegação entre páginas**: Botões Anterior/Próxima em cada painel
- **Indicador de páginas**: "Exibindo 1-50 de 1600 alunos"

## 🛠️ Instalação e Configuração

### Pré-requisitos

- Node.js 18+ instalado
- Conta no Firebase (https://console.firebase.google.com/)
- Projeto Firebase criado

### 1. Clonar o Repositório

```bash
git clone <seu-repositorio>
cd painel-localizacao
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Firebase

Você tem **3 opções** para configurar o Firebase:

#### Opção A: Variáveis de Ambiente (Recomendado)

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá em **Configurações do projeto** (⚙️) > **Contas de serviço**
4. Clique em **Gerar nova chave privada**
5. Um arquivo JSON será baixado

6. Abra o arquivo `.env` e configure:

```env
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-projeto-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n"
```

#### Opção B: Arquivo serviceAccountKey.json (Desenvolvimento Local)

1. Baixe o arquivo JSON do Firebase (passo acima)
2. Renomeie para `serviceAccountKey.json`
3. Coloque na raiz do projeto
4. O sistema detectará automaticamente

#### Opção C: Application Default Credentials (Deploy no GCP)

Se você está rodando no Google Cloud Platform:

```env
GCP_PROJECT=seu-projeto-id
```

O sistema usará automaticamente as credenciais do ambiente GCP.

### 4. Testar Configuração

```bash
node test-firebase.js
```

Se tudo estiver correto, você verá:

```
✅ Firebase Admin SDK inicializado com sucesso!
✅ Conexão com Firestore estabelecida!
🎉 Teste concluído com SUCESSO!
```

### 5. Iniciar Servidor

```bash
# Produção
npm start

# Desenvolvimento (com hot-reload)
npm run dev
```

Acesse: http://localhost:3000

---

## 🌐 Deploy no Google Cloud Platform

Para fazer deploy no GCP, consulte o guia completo:

📖 **[DEPLOY_GCP.md](./DEPLOY_GCP.md)**

O guia contém instruções detalhadas para:
- ☁️ Cloud Run (Recomendado)
- 🚀 App Engine
- 🔐 Secret Manager
- 🛡️ Segurança e boas práticas

---

## 🚀 Como Usar

### Movimentar Alunos

#### Opção 1: Drag & Drop (Arrastar e Soltar)
1. Clique e segure um card de aluno
2. Arraste até o painel de destino
3. Solte o mouse - ✅ Movimentação registrada!

#### Opção 2: Botão "Mover"
1. Clique no botão "🔄 Mover" no card
2. Escolha o destino no menu
3. ✅ Movimentação registrada!

#### Opção 3: Modal de Detalhes
1. Clique em "👁️ Detalhes"
2. Use os botões de destino no modal
3. ✅ Movimentação registrada!

## 📋 Recursos Adicionais

- **Pesquisar**: Digite nome ou CPF na barra de pesquisa
- **Filtrar**: Selecione uma viagem específica
- **Histórico**: Veja todas movimentações no modal de detalhes
- **Atualizar**: Botão 🔄 ou tecla F5

---

**Desenvolvido com ❤️ para Ellus**
