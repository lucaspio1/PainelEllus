# Guia de Deploy - Cloud Run

## ⚠️ Problema: Firebase não conecta no Cloud Run

Se o deploy funciona mas não carrega dados, o Firebase não está conectando. Siga os passos abaixo:

## 🔍 Diagnóstico

1. Acesse os logs do Cloud Run:
   ```bash
   gcloud run services logs read painelellus --project embarquellus-build
   ```

2. Acesse o endpoint de health check:
   ```
   https://[SUA-URL-DO-CLOUD-RUN]/health
   ```

## ✅ Solução 1: Configurar Credenciais via Variáveis de Ambiente

### Passo 1: Obter as Credenciais do Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá em **Configurações do Projeto** (ícone de engrenagem) > **Contas de Serviço**
4. Clique em **Gerar nova chave privada**
5. Baixe o arquivo JSON

### Passo 2: Configurar no Cloud Run

Você tem duas opções:

#### Opção A: Via Console do GCP (Recomendado)

1. Acesse o [Cloud Run Console](https://console.cloud.google.com/run)
2. Clique no serviço `painelellus`
3. Clique em **EDITAR E IMPLANTAR NOVA REVISÃO**
4. Vá na aba **Variáveis e Secrets**
5. Adicione as variáveis de ambiente:
   - `FIREBASE_PROJECT_ID`: seu-project-id
   - `FIREBASE_CLIENT_EMAIL`: firebase-adminsdk-xxxxx@seu-project-id.iam.gserviceaccount.com
   - `FIREBASE_PRIVATE_KEY`: (cole a chave privada do JSON - mantenha as quebras de linha)
6. Clique em **IMPLANTAR**

#### Opção B: Via gcloud CLI

```bash
gcloud run services update painelellus \
  --project embarquellus-build \
  --region us-central1 \
  --set-env-vars="FIREBASE_PROJECT_ID=seu-project-id,FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-project-id.iam.gserviceaccount.com" \
  --set-secrets="FIREBASE_PRIVATE_KEY=firebase-private-key:latest"
```

**Nota:** Para a `FIREBASE_PRIVATE_KEY`, recomendamos usar o Secret Manager:

1. Criar secret:
   ```bash
   echo -n "-----BEGIN PRIVATE KEY-----
   SUA_CHAVE_AQUI
   -----END PRIVATE KEY-----" | gcloud secrets create firebase-private-key \
     --project embarquellus-build \
     --data-file=-
   ```

2. Dar permissão ao Cloud Run:
   ```bash
   gcloud secrets add-iam-policy-binding firebase-private-key \
     --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor" \
     --project embarquellus-build
   ```

## ✅ Solução 2: Configurar Permissões da Service Account (ADC)

Se preferir usar Application Default Credentials sem credenciais explícitas:

### Passo 1: Verificar qual Service Account o Cloud Run está usando

```bash
gcloud run services describe painelellus \
  --project embarquellus-build \
  --region us-central1 \
  --format="value(spec.template.spec.serviceAccountName)"
```

### Passo 2: Dar permissões de Firestore à Service Account

```bash
# Substitua [SERVICE_ACCOUNT] pelo retorno do comando anterior
# Se estiver vazio, use: PROJECT_NUMBER-compute@developer.gserviceaccount.com

gcloud projects add-iam-policy-binding embarquellus-build \
  --member="serviceAccount:[SERVICE_ACCOUNT]" \
  --role="roles/datastore.user"
```

### Passo 3: Se o Firestore estiver em outro projeto

Se o Firebase/Firestore estiver em um projeto diferente de `embarquellus-build`:

1. Identifique o projeto correto do Firebase
2. Atualize `app.yaml`:
   ```yaml
   env_variables:
     GCP_PROJECT: "SEU-PROJETO-FIREBASE"
     FIREBASE_PROJECT_ID: "SEU-PROJETO-FIREBASE"
   ```
3. Dê permissões ao Cloud Run no projeto do Firebase:
   ```bash
   gcloud projects add-iam-policy-binding SEU-PROJETO-FIREBASE \
     --member="serviceAccount:[SERVICE_ACCOUNT]" \
     --role="roles/datastore.user"
   ```

## 🔍 Verificação

Após configurar, verifique:

1. **Logs do Cloud Run:**
   ```bash
   gcloud run services logs read painelellus --project embarquellus-build
   ```

   Procure por:
   - ✅ `Firebase conectado via variáveis de ambiente`
   - ✅ `Firebase conectado via ADC (GCP)`
   - ❌ `ERRO: Nenhuma credencial Firebase encontrada!`

2. **Health Check:**
   ```
   curl https://[SUA-URL]/health
   ```

   Deve retornar:
   ```json
   {
     "status": "healthy",
     "firebase": "connected",
     ...
   }
   ```

## 🆘 Troubleshooting

### Erro: "Permission denied"
- Verifique se a service account tem permissões no Firestore
- Confirme que o projeto Firebase está correto

### Erro: "Invalid private key"
- Verifique se a chave privada está completa (incluindo BEGIN e END)
- Certifique-se de que as quebras de linha estão preservadas

### Erro: "Project not found"
- Confirme que o FIREBASE_PROJECT_ID está correto
- Verifique se o projeto existe no Firebase Console

### Ainda não funciona?
- Execute o health check: `https://[URL]/health`
- Veja os logs detalhados no console do GCP
- Verifique se há erros de permissão do IAM
