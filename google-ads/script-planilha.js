/**
 * Painel Guga Fernandes · exportação do Google Ads para a planilha do painel (v2)
 *
 * Onde colar: Google Ads (conta Guga Fernandes, 551-693-2482) > Ferramentas > Ações em massa > Scripts,
 * abra "Dashboard - export diario para planilha", apague o código antigo, cole este e salve.
 * Frequência: diariamente, entre 5h e 6h (a tarefa do painel lê a planilha às 6h51).
 *
 * Escreve 4 abas com os últimos 90 dias, uma linha por dia:
 *   dados   campanha por dia (mesmas colunas da versão 1)
 *   videos  vídeo por dia, com o ID e o título do vídeo do YouTube
 *   idade   faixa etária por dia
 *   genero  gênero por dia
 * e uma aba "log" com o resultado de cada parte. Uma parte que falhar não impede as outras.
 */

var SHEET_URL = 'https://docs.google.com/spreadsheets/d/1VGDtFWjj_MaklI7cXTooba_d_ze705aZ1BP7mcORT8s/edit';
var DAYS = 90;

// Nome das visualizações muda entre versões da API: tenta o novo e, se não existir, o antigo.
var VIEWS = [
  { field: 'metrics.video_trueview_views', key: 'videoTrueviewViews' },
  { field: 'metrics.video_views', key: 'videoViews' }
];
var QUARTILES = ['metrics.video_quartile_p25_rate', 'metrics.video_quartile_p50_rate',
  'metrics.video_quartile_p75_rate', 'metrics.video_quartile_p100_rate'];

function main() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var start = new Date();
  start.setDate(start.getDate() - DAYS);
  var from = Utilities.formatDate(start, tz, 'yyyy-MM-dd');
  var to = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var when = ' WHERE segments.date BETWEEN "' + from + '" AND "' + to + '" AND metrics.impressions > 0 ORDER BY segments.date';
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  var ss = SpreadsheetApp.openByUrl(SHEET_URL);
  var log = [];

  // 1) campanhas por dia
  run(log, 'dados', function () {
    var head = ['data', 'campanha_id', 'campanha', 'status', 'tipo', 'impressoes', 'cliques', 'custo',
      'visualizacoes', 'engajamentos', 'conversoes', 'valor_conversoes', 'q25', 'q50', 'q75', 'q100', 'atualizado_em'];
    var rows = withViews(function (v) {
      var q = 'SELECT segments.date, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ' +
        'metrics.impressions, metrics.clicks, metrics.cost_micros, ' + v.field + ', metrics.engagements, ' +
        'metrics.conversions, metrics.conversions_value, ' + QUARTILES.join(', ') + ' FROM campaign' + when;
      return collect(q, function (r) {
        var m = r.metrics || {};
        return [r.segments.date, String(r.campaign.id), r.campaign.name, r.campaign.status, r.campaign.advertisingChannelType,
          num(m.impressions), num(m.clicks), num(m.costMicros) / 1e6, num(m[v.key]), num(m.engagements),
          num(m.conversions), num(m.conversionsValue)].concat(quart(m)).concat([now]);
      });
    });
    write(ss, 'dados', head, rows);
    return rows.length;
  });

  // 2) vídeos por dia (ID e título do YouTube)
  run(log, 'videos', function () {
    var head = ['data', 'campanha_id', 'campanha', 'video_id', 'video_titulo', 'duracao_seg', 'impressoes', 'cliques',
      'custo', 'visualizacoes', 'engajamentos', 'q25', 'q50', 'q75', 'q100', 'atualizado_em'];
    var rows = withViews(function (v) {
      var q = 'SELECT segments.date, campaign.id, campaign.name, video.id, video.title, video.duration_millis, ' +
        'metrics.impressions, metrics.clicks, metrics.cost_micros, ' + v.field + ', metrics.engagements, ' +
        QUARTILES.join(', ') + ' FROM video' + when;
      return collect(q, function (r) {
        var m = r.metrics || {}, vd = r.video || {};
        return [r.segments.date, String(r.campaign.id), r.campaign.name, vd.id || '', vd.title || '',
          Math.round(num(vd.durationMillis) / 1000), num(m.impressions), num(m.clicks), num(m.costMicros) / 1e6,
          num(m[v.key]), num(m.engagements)].concat(quart(m)).concat([now]);
      });
    });
    write(ss, 'videos', head, rows);
    return rows.length;
  });

  // 3) idade e 4) gênero
  [['idade', 'age_range_view', 'ageRange', 'ad_group_criterion.age_range.type'],
   ['genero', 'gender_view', 'gender', 'ad_group_criterion.gender.type']].forEach(function (d) {
    run(log, d[0], function () {
      var head = ['data', 'campanha_id', 'segmento', 'impressoes', 'cliques', 'custo', 'visualizacoes', 'q100', 'atualizado_em'];
      var rows = withViews(function (v) {
        var q = 'SELECT segments.date, campaign.id, ' + d[3] + ', metrics.impressions, metrics.clicks, metrics.cost_micros, ' +
          v.field + ', metrics.video_quartile_p100_rate FROM ' + d[1] + when;
        return collect(q, function (r) {
          var m = r.metrics || {}, c = (r.adGroupCriterion || {})[d[2]] || {};
          return [r.segments.date, String(r.campaign.id), c.type || 'UNDETERMINED', num(m.impressions), num(m.clicks),
            num(m.costMicros) / 1e6, num(m[v.key]), num(m.videoQuartileP100Rate), now];
        });
      });
      write(ss, d[0], head, rows);
      return rows.length;
    });
  });

  write(ss, 'log', ['parte', 'ok', 'linhas', 'mensagem', 'atualizado_em'],
    log.map(function (l) { return [l.part, l.ok ? 'sim' : 'não', l.rows, l.msg, now]; }));
  Logger.log(JSON.stringify(log));
}

function run(log, part, fn) {
  try { var n = fn(); log.push({ part: part, ok: true, rows: n, msg: '' }); }
  catch (e) { log.push({ part: part, ok: false, rows: 0, msg: String(e).slice(0, 300) }); Logger.log(part + ': ' + e); }
}

function withViews(build) {
  var last;
  for (var i = 0; i < VIEWS.length; i++) {
    try { return build(VIEWS[i]); } catch (e) { last = e; if (String(e).indexOf('video') < 0) throw e; }
  }
  throw last;
}

function collect(query, map) {
  var it = AdsApp.search(query), out = [];
  while (it.hasNext()) out.push(map(it.next()));
  return out;
}

function quart(m) {
  return [num(m.videoQuartileP25Rate), num(m.videoQuartileP50Rate), num(m.videoQuartileP75Rate), num(m.videoQuartileP100Rate)];
}

function write(ss, name, head, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
}

function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
