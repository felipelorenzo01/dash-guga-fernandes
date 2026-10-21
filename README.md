# Painel Guga Fernandes · Latinopolitano

Painel das campanhas do Guga Fernandes: Meta Ads (seguidores e visitas ao perfil no Instagram) e YouTube pelo Google Ads (visualizações, CPV e retenção do vídeo), com visão geral, seletor de período e comparação entre períodos.

- `index.html`: o painel. Busca os números em `data.json`.
- `data.json`: dados diários dos últimos 90 dias, gerados por `scripts/build-data.js`.
- `thumbs/` e `assets/`: miniaturas dos criativos e capa do vídeo.
- `google-ads/script-planilha.js`: script que roda dentro do Google Ads e escreve os números na planilha lida pelo painel.
- `UPDATE.md`: roteiro da atualização automática (todo dia às 6h51).

Deploy: repositório conectado ao Vercel. Cada push publica a nova versão.
