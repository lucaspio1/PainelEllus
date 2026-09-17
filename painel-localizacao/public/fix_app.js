const fs = require('fs');

let content = fs.readFileSync('/Users/lucaspio/Documents/Ellus/PainelEllus/painel-localizacao/public/app.js', 'utf8');

const authFunctions = `function getAuthHeaders() {
  const token = localStorage.getItem('painel_token');
  return { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` };
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

`;

content = authFunctions + content;

content = content.replace("localStorage.removeItem('operadorEllus');", "localStorage.removeItem('operadorEllus');\n        localStorage.removeItem('painel_token');");
content = content.replace(/fetch\('\/api\/pessoas'\)/g, "authFetch('/api/pessoas')");
content = content.replace(/fetch\('\/api\/quartos'\)/g, "authFetch('/api/quartos')");
content = content.replace(/fetch\('\/api\/viagens'\)/g, "authFetch('/api/viagens')");
content = content.replace(/fetch\('\/api\/movimentar'/g, "authFetch('/api/movimentar'");
content = content.replace(/fetch\(`\/api\/logs/g, "authFetch(`/api/logs");

fs.writeFileSync('/Users/lucaspio/Documents/Ellus/PainelEllus/painel-localizacao/public/app.js', content);
