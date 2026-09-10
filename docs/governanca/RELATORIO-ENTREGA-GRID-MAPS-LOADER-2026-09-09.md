## Relatório de Entrega — Grid: mapa e API de rota

**Data:** 2026-09-09  
**Branch:** `dev` (não publicado)  
**Publicou?** [x] Não

### Reutilização
- `loadGoogleMapsScript` em `places-autocomplete.tsx` (estendido e reutilizado pelo Grid).
- Cascata de chave já usada em `google-routes-tolls.ts`.

### Causa raiz
1. Places carregava Maps só com `libraries=places`. O Grid via o script e **não** carregava `geometry` — “Ver Rota” não decodificava a polilinha.
2. `/api/service-orders/:id/route` e `/api/road-distance` usavam só `VITE_GOOGLE_MAPS_API_KEY` (restrita por HTTP referrer). No servidor Vercel não há referrer — Directions falha. `GOOGLE_MAPS_API_KEY` já existe na Vercel.

A barra de evolução **não** usa a API do Google (só GPS/haversine). Por isso a barra funcionou e o mapa/rota pararam.

### O que foi alterado
- Loader único: `places,geometry` + `importLibrary`.
- Grid deixa de injetar um segundo `<script>` do Maps.
- Servidor: `googleMapsServerKey()`.
- Import `html2canvas` (estava `-ohtml2canvas`).

### Arquivos
- `client/src/components/places-autocomplete.tsx`
- `client/src/pages/admin/operational-grid.tsx`
- `server/lib/google-routes-tolls.ts`
- `server/routes/service-orders.ts` (só as linhas da chave; o arquivo ainda tem WIP de e-mails não relacionado)

### Testes
- N/A financeiro. Sem browser autenticado nesta sessão.

### Rollback
- Reverter os quatro arquivos acima.

### Próximo passo
- Publicar quando o proprietário pedir, para o Grid em produção pegar o loader e a chave de servidor.
