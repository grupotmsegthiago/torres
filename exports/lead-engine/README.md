# Lead Engine — Motor de Prospecção Automática

Motor completo de prospecção de leads com busca web, extração de contatos, filtro anti-concorrente, e-mail marketing com tracking e CRM básico.

## O que faz

- **Prospecção automática**: Busca empresas no DuckDuckGo e Bing, extrai e-mails e telefones dos sites
- **Filtro anti-concorrente**: Descarta automaticamente sites de concorrentes (por conteúdo, domínio e marca)
- **E-mail marketing**: Sequência de 5 e-mails com cadência automática (configurável)
- **Tracking de abertura**: Pixel 1x1 que registra quando o lead abriu o e-mail
- **Relatório diário**: Enviado por e-mail com métricas de envio e pipeline
- **CRM básico**: API REST para listar, criar, editar, deletar leads
- **Import CSV**: Importação em massa via API
- **Scoring**: Pontuação automática por setor, localização e temperatura

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `leads-engine.ts` | Código completo do motor (autocontido) |
| `config-example.ts` | Configuração editável (queries, SMTP, blacklist, templates) |
| `schema.sql` | SQL para criar as tabelas no banco |
| `README.md` | Este arquivo |

## Instalação

### 1. Banco de Dados

Execute o `schema.sql` no seu banco PostgreSQL (Supabase, Neon, etc.):

```bash
psql $DATABASE_URL -f schema.sql
```

Ou cole o conteúdo no SQL Editor do Supabase.

### 2. Dependências

Instale os pacotes necessários no seu projeto:

```bash
npm install @supabase/supabase-js nodemailer node-cron
npm install -D @types/nodemailer @types/node-cron
```

### 3. Configuração

1. Copie `config-example.ts` para `config.ts`
2. Edite com os dados da sua empresa
3. Adapte as queries de busca para o seu segmento-alvo
4. Atualize a blacklist de concorrentes para o seu setor
5. Personalize os templates de e-mail

### 4. Variáveis de Ambiente

Configure no seu projeto:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=comercial@suaempresa.com.br
SMTP_PASS=sua_senha_smtp
SMTP_FROM=comercial@suaempresa.com.br
```

### 5. Integração no Express

No seu arquivo principal do servidor:

```typescript
import express from "express";
import { registerLeadRoutes, setAuthMiddleware } from "./leads-engine";

const app = express();
app.use(express.json());

// IMPORTANTE: Configure a autenticação ANTES de registrar as rotas.
// Sem isso, todas as rotas protegidas retornam 403.
setAuthMiddleware((req, res, next) => {
  // Substitua pela sua lógica real (JWT, session, etc.)
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Token ausente" });
  // Valide o token aqui...
  next();
});

// Registra todas as rotas e CRONs do lead engine
registerLeadRoutes(app);

app.listen(5000, () => console.log("Server running on port 5000"));
```

### 6. Autenticação

Por segurança, todas as rotas protegidas são **bloqueadas por padrão** (retornam 403). Você deve chamar `setAuthMiddleware()` com sua lógica real antes de registrar as rotas. O middleware recebe `(req, res, next)` padrão do Express.

## API Endpoints

### Leads

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/leads` | Listar todos os leads |
| `GET` | `/api/leads/stats` | Estatísticas do pipeline |
| `POST` | `/api/leads` | Criar lead manualmente |
| `PATCH` | `/api/leads/:id` | Atualizar lead |
| `DELETE` | `/api/leads/:id` | Deletar lead |
| `GET` | `/api/leads/setores` | Setores e origens disponíveis |
| `GET` | `/api/leads/cargos-sugeridos` | Cargos e prefixos de e-mail |

### E-mail Marketing

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/leads/:id/enviar-apresentacao` | Enfileirar e-mail para um lead |
| `GET` | `/api/leads/email-queue` | Fila de e-mails |
| `GET` | `/api/leads/email-stats` | Métricas de e-mail |
| `POST` | `/api/leads/disparar-agora` | Disparar lote manualmente |
| `POST` | `/api/leads/email-queue/:id/marcar-respondido` | Marcar como respondido |
| `DELETE` | `/api/leads/email-queue/:id` | Remover da fila |
| `POST` | `/api/leads/email-queue/limpar-fila` | Limpar pendentes |
| `POST` | `/api/leads/enviar-relatorio` | Enviar relatório manualmente |

### Prospecção

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/leads/auto-prospect/status` | Status da prospecção |
| `POST` | `/api/leads/auto-prospect/trigger` | Disparar ciclo manualmente |
| `POST` | `/api/leads/import-csv` | Importar leads de CSV |

### Tracking

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/leads/pixel/:trackingId.png` | Pixel de rastreamento (público) |

## CRONs Automáticos

| Intervalo | Ação |
|-----------|------|
| A cada 5 min | Enfileira leads + dispara e-mails pendentes |
| A cada 10 min | Prospecção automática (3 queries/ciclo) |
| 21h BRT | Relatório diário por e-mail |

## Como Adaptar para Outro Segmento

1. **Queries**: Edite `SEARCH_QUERIES` no `config.ts` com termos do seu segmento
2. **Blacklist**: Atualize `BLACKLIST_COMPETITOR` e `BLACKLIST_BRANDS` com termos e marcas dos seus concorrentes
3. **Termos positivos**: Ajuste `POSITIVE_TERMS` com palavras-chave dos seus clientes-alvo
4. **Exclusão**: Modifique `EXCLUSION_TERMS` para excluir termos concorrentes das buscas
5. **Templates**: Personalize os textos em `getFollowUpContent()` no `leads-engine.ts`
6. **Scoring**: Ajuste `SCORING_SETOR` e `ZONAS_RISCO` no `config.ts`

## Monitoramento

Acompanhe nos logs do servidor:

```
[lead-engine] ✓ Enviado: contato@empresa.com.br (Empresa XYZ)
[lead-engine] [Filtro] Concorrente descartado: seguranca-abc.com.br
[lead-engine] Query #15 "transportadora SP" → 12 sites, 3 novos leads
[lead-engine] ✓ Ciclo: 5 novos leads em 45.2s. Total acumulado: 127
```
