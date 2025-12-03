# Dockerfile para deploy no Google Cloud Run
FROM node:18-slim

# Criar diretório da aplicação
WORKDIR /usr/src/app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production

# Copiar código da aplicação
COPY . .

# Expor porta (Cloud Run usa 8080 por padrão, mas podemos configurar via env)
EXPOSE 8080

# Variável de ambiente para porta (Cloud Run sobrescreve automaticamente)
ENV PORT=8080

# Comando para iniciar a aplicação
CMD [ "node", "server.js" ]
