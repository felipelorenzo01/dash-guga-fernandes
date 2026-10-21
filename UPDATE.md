# Como atualizar os dados do painel

Este roteiro é seguido pela tarefa agendada do Claude todo dia às 6h51 (horário da Bahia). Ele também serve pra rodar à mão.
Só leitura: nunca crie, edite, pause ou ative nada na Meta ou no Google Ads.

Fuso America/Bahia. HOJE = data de hoje (AAAA-MM-DD). DESDE = HOJE menos 89 dias.

## 1. Meta Ads

Conector **"MCP - Meta"**, ferramenta `ads_get_ad_entities`, conta `4538249366414103` (CA 01 - Guga Fernandes).
- Em todas as chamadas: o mesmo `client_conversation_id` (20 caracteres aleatórios), `include_additional_context: false`, `time_range` `{"since":DESDE,"until":HOJE}`, `time_increment: "1"`, `limit: 1000` e o filtro `[{"field":"amount_spent","operator":"GREATER_THAN","value":["0"]}]`.
- Salve o campo `ad_entities` de cada resposta (vem como texto JSON) na pasta `raw/`. Se a resposta cair num arquivo por ser grande, extraia com `jq -r '.ad_entities'`. Se vier `pagination.next_cursor`, repita com `cursor` e junte as listas.

| Arquivo | level | breakdowns | fields |
|---|---|---|---|
| `raw/adsets.json` | adset | — | id, name, campaign_name, amount_spent, impressions, link_click, results, instagram_profile_follow_v2 |
| `raw/demo.json` | adset | ["age","gender"] | id, name, amount_spent, impressions, link_click, instagram_profile_follow_v2 |
| `raw/ads.json` | ad | — | id, name, campaign_name, adset_name, amount_spent, impressions, link_click, results, instagram_profile_follow_v2, video_play_actions |

Seguidores vêm em `instagram_profile_follow_v2`. Visitas ao perfil vêm em `results`, no indicador `profile_visit_view`.

## 2. YouTube (Google Ads)

Os números do Google Ads chegam por uma planilha que o Google Ads Script (`google-ads/script-planilha.js`) preenche todo dia entre 5h e 6h, dentro da própria conta do Google Ads. A API do Google Ads não é acessível pela tarefa agendada.

1. Conector **Google Drive**, ferramenta `download_file_content`, `fileId` `1VGDtFWjj_MaklI7cXTooba_d_ze705aZ1BP7mcORT8s`, `exportMimeType` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
2. Grave o campo `content` (base64) em `raw/google.xlsx.b64` e rode:
   ```bash
   base64 -d raw/google.xlsx.b64 > raw/google.xlsx
   python3 scripts/xlsx-to-json.py raw/google.xlsx raw/google.json
   ```
3. Confira a aba `dados`: se não houver linhas, ou se `atualizado_em` for de mais de 2 dias atrás, apague `raw/google.json` (o script mantém o YouTube do data.json anterior) e avise como PROBLEMA ("o script do Google Ads não rodou").

O que o script escreve: `dados` (campanha por dia), `videos` (vídeo por dia, com ID e título), `idade`, `genero` e `log`. Os quartis (25%, 50%, 75%, 100%) são taxas: o painel junta dias e vídeos ponderando pelas impressões, nunca somando. CPV, taxa de visualização, CPM e CTR são sempre recalculados das somas.

## 3. Prévias dos criativos da Meta

Rode `UNTIL=HOJE node scripts/build-data.js raw` uma primeira vez. Para cada criativo em `data.json` → `meta.creatives`, chame `ads_get_ad_preview` com `ad_id` = `adId` e `ad_format: "INSTAGRAM_STORY"` (sem `ad_account_id`). Guarde o `preview_url` trocando `&amp;` por `&`.

Miniatura: a ferramenta não devolve mais a imagem, só o link. O painel usa o arquivo `thumbs/<nome-do-criativo-sem-o-número, minúsculo, sem acento, com hífens>.jpg` quando ele existe. Criativo novo sem miniatura aparece com o nome no lugar da imagem: avise numa linha `AVISO: criativo sem miniatura: <nome>` para o Felipe mandar um quadro do vídeo (300 px de largura, JPG).

Escreva `raw/previews.json` neste formato (a chave é o nome do criativo, campo `name`):

```json
{ "Impulsionamento 01 - Voltei a minhas raizes": { "url": "https://business.facebook.com/ads/api/preview_iframe.php?...", "thumb": "thumbs/voltei-as-minhas-raizes.jpg" } }
```

## 4. Gerar o data.json e publicar

```bash
UNTIL=HOJE node scripts/build-data.js raw
git add data.json thumbs
git commit -m "Atualiza dados $(TZ=America/Bahia date +%d/%m\ %H:%M)"
git push
```

Antes do commit, confira a saída do script: precisa ter linhas por dia da Meta e do YouTube. Se o investimento de um canal vier zerado mas o data.json anterior tinha gasto nele nos últimos 7 dias, não publique e avise como PROBLEMA (pode ser falha na leitura).

A pasta `raw/` não vai para o repositório. O Vercel publica sozinho a cada push.

## Praças

Se os conjuntos de anúncios da Meta passarem a ter praças no nome (ex.: "[Salvador]", "[SP Capital]"), cadastre cada praça em `scripts/config.json` → `meta.cities` (`key`, `label`, `uf`, `keywords`). Com duas praças ou mais, o comparativo com ★ aparece sozinho na aba Meta Ads.
