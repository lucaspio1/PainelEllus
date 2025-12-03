# Guia de Deploy no Google Cloud Platform (GCP)

Este guia mostra como fazer o deploy da aplicação no GCP usando Cloud Run ou App Engine.

## Pré-requisitos

1. Conta no Google Cloud Platform
2. Projeto Firebase criado
3. Google Cloud CLI instalado (gcloud)
4. Credenciais de service account do Firebase

---

## 1. Configurar Firebase

### 1.1. Obter Credenciais do Firebase

1. Acesse: https://console.firebase.google.com/
2. Selecione seu projeto
3. Clique no ícone de **engrenagem** (⚙️) > **Configurações do projeto**
4. Vá na aba **Contas de serviço**
5. Clique em **Gerar nova chave privada**
6. Um arquivo JSON será baixado (ex: `seu-projeto-firebase-adminsdk-xxxxx.json`)

### 1.2. Extrair Informações do Arquivo JSON

Abra o arquivo JSON baixado e localize:

```json
{
  "type": "service_account",
  "project_id": "seu-projeto-id",
  "private_key_id": "xxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@seu-projeto-id.iam.gserviceaccount.com",
  ...
}
```

Você precisará de:
- `project_id` → **FIREBASE_PROJECT_ID**
- `client_email` → **FIREBASE_CLIENT_EMAIL**
- `private_key` → **FIREBASE_PRIVATE_KEY**

---

## 2. Opção A: Deploy no Cloud Run (Recomendado)

Cloud Run é ideal para aplicações containerizadas, com escalabilidade automática e pay-per-use.

### 2.1. Preparar Variáveis de Ambiente

Crie um arquivo `env.yaml` (NÃO commitar no git):

```yaml
FIREBASE_PROJECT_ID: "seu-projeto-id"
FIREBASE_CLIENT_EMAIL: "firebase-adminsdk-xxxxx@seu-projeto-id.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nCOLE_SUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n"
PORT: "8080"
```

⚠️ **IMPORTANTE**: Adicione `env.yaml` no `.gitignore`!

### 2.2. Deploy com Cloud Run

```bash
# 1. Fazer login no GCP
gcloud auth login

# 2. Configurar projeto
gcloud config set project SEU_PROJECT_ID

# 3. Build da imagem Docker
gcloud builds submit --tag gcr.io/SEU_PROJECT_ID/painel-ellus

# 4. Deploy no Cloud Run
gcloud run deploy painel-ellus \
  --image gcr.io/SEU_PROJECT_ID/painel-ellus \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --env-vars-file env.yaml
```

### 2.3. Usando Secrets Manager (Mais Seguro)

```bash
# 1. Criar secrets
echo -n "seu-projeto-id" | gcloud secrets create firebase-project-id --data-file=-
echo -n "firebase-adminsdk-xxxxx@seu-projeto-id.iam.gserviceaccount.com" | gcloud secrets create firebase-client-email --data-file=-
cat private_key.txt | gcloud secrets create firebase-private-key --data-file=-

# 2. Deploy com secrets
gcloud run deploy painel-ellus \
  --image gcr.io/SEU_PROJECT_ID/painel-ellus \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --update-secrets FIREBASE_PROJECT_ID=firebase-project-id:latest,FIREBASE_CLIENT_EMAIL=firebase-client-email:latest,FIREBASE_PRIVATE_KEY=firebase-private-key:latest
```

---

## 3. Opção B: Deploy no App Engine

### 3.1. Configurar Variáveis de Ambiente no App Engine

Edite o arquivo `app.yaml` e adicione suas credenciais:

```yaml
runtime: nodejs18

env_variables:
  FIREBASE_PROJECT_ID: "seu-projeto-id"
  FIREBASE_CLIENT_EMAIL: "firebase-adminsdk-xxxxx@seu-projeto-id.iam.gserviceaccount.com"
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nCOLE_SUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n"
```

### 3.2. Deploy no App Engine

```bash
# 1. Fazer login
gcloud auth login

# 2. Configurar projeto
gcloud config set project SEU_PROJECT_ID

# 3. Deploy
gcloud app deploy

# 4. Ver logs
gcloud app logs tail -s default
```

---

## 4. Opção C: Usar Application Default Credentials (ADC)

Se você rodar a aplicação em uma VM do Compute Engine ou no Cloud Run/App Engine, pode usar as credenciais padrão do GCP:

### 4.1. Atribuir Papel ao Service Account

```bash
# Obter o service account do Cloud Run/App Engine
gcloud iam service-accounts list

# Dar permissões ao Firestore
gcloud projects add-iam-policy-binding SEU_PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/datastore.user"
```

### 4.2. Configurar apenas o Project ID

No arquivo `.env` ou nas variáveis de ambiente:

```bash
GCP_PROJECT=seu-projeto-id
```

O sistema detectará automaticamente as credenciais do ambiente GCP.

---

## 5. Verificar Configuração

Após o deploy, acesse a URL fornecida e verifique:

1. **Logs de inicialização**: Deve aparecer uma das mensagens:
   - ✅ Firebase conectado via variáveis de ambiente
   - ✅ Firebase conectado via ADC (GCP)
   - ✅ Firebase conectado via serviceAccountKey.json

2. **Teste de login**: Acesse `/login` e tente fazer login

3. **Verificar API**: Acesse `/api/pessoas` para testar conexão com Firestore

---

## 6. Segurança - Boas Práticas

### ✅ FAZER:
- Usar **Secret Manager** para credenciais sensíveis
- Adicionar `.env` e `env.yaml` no `.gitignore`
- Usar **ADC** quando possível (mais seguro)
- Limitar acessos com IAM roles específicas
- Habilitar HTTPS obrigatório

### ❌ NÃO FAZER:
- Commitar credenciais no git
- Compartilhar arquivos `serviceAccountKey.json`
- Usar credenciais em logs ou console.log()
- Deixar variáveis de ambiente expostas publicamente

---

## 7. Solução de Problemas

### Erro: "Nenhuma credencial Firebase encontrada"

**Causa**: As variáveis de ambiente não estão configuradas.

**Solução**:
1. Verifique se as variáveis estão corretas no `.env` ou `app.yaml`
2. No Cloud Run: use `gcloud run services describe painel-ellus` para ver env vars
3. No App Engine: use `gcloud app versions describe VERSION_ID`

### Erro: "Permission denied" no Firestore

**Causa**: O service account não tem permissões no Firestore.

**Solução**:
```bash
gcloud projects add-iam-policy-binding SEU_PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/datastore.user"
```

### Erro: "Invalid private key"

**Causa**: A chave privada foi mal formatada ou quebrou as quebras de linha.

**Solução**:
- Certifique-se de que `\n` estão preservados na string
- Use aspas duplas ao definir a variável
- Teste localmente primeiro com `.env` antes de fazer deploy

---

## 8. Comandos Úteis

```bash
# Ver logs do Cloud Run
gcloud run services logs read painel-ellus --region us-central1 --limit 50

# Ver logs do App Engine
gcloud app logs tail -s default

# Listar deployments do Cloud Run
gcloud run services list

# Atualizar variáveis de ambiente (Cloud Run)
gcloud run services update painel-ellus \
  --update-env-vars FIREBASE_PROJECT_ID=novo-valor

# Deletar service (Cloud Run)
gcloud run services delete painel-ellus --region us-central1
```

---

## 9. Custo Estimado

### Cloud Run (Pay-per-use)
- **Grátis**: 2 milhões de requests/mês
- **Depois**: ~$0.40 por milhão de requests
- **Ideal para**: Aplicações com tráfego variável

### App Engine (Standard)
- **Grátis**: 28 horas de instância/dia
- **Depois**: ~$0.05 por hora de instância
- **Ideal para**: Aplicações com tráfego constante

---

## 10. Próximos Passos

1. ✅ Deploy realizado
2. ✅ Firebase conectado
3. ⬜ Configurar domínio customizado
4. ⬜ Configurar SSL/TLS
5. ⬜ Configurar monitoramento e alertas
6. ⬜ Configurar backup do Firestore
7. ⬜ Implementar CI/CD com GitHub Actions

---

## Suporte

Para mais informações:
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [App Engine Docs](https://cloud.google.com/appengine/docs)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)
