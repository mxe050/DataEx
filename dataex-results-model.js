/* Presentation only. The extraction Core and its immutable Raw remain authoritative. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./dataex-ico-mapping.js') : root.DataExICO);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DataExResultsModel = api;
})(typeof window === 'undefined' ? null : window, function (ico) {
  'use strict';
  const VERSION = '2.0.0';
  const norm = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[−–—]/g, '-').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // Time is not the adjustment variable: post-baseline and baseline-adjusted are not baseline.
  function timePhase(text) {
    const t=String(text||'').normalize('NFKC').toLowerCase().replace(/[−–—‐‑]/g,'-').trim();
    if (/change|difference from baseline|変化量|ベースラインからの変化/.test(t)) return 'change';
    if (/post[-\s]*(?:baseline|treatment|intervention)|after (?:baseline|treatment|intervention)|介入後|治療後/.test(t)) return 'post';
    if (/baseline[-\s]*adjust|adjust(?:ed|ment).*baseline|ベースライン.*調整/.test(t)) return 'unspecified';
    // A leading pre-treatment time can include a window/examination qualifier.
    // Covariate descriptions and pre/post comparisons are not baseline measurements.
    if (/^(?:pre[-\s]?(?:treatment|intervention)|before (?:treatment|intervention))(?=\s|\d|$)/.test(t) && !/adjust|covariate|versus|\bvs\b|compar|post|after/.test(t)) return 'baseline';
    if (/^(?:at\s+)?baseline\s+(?:pre[-\s]?[a-z]+|at (?:inclusion|enrolment|enrollment|randomization))$/.test(t)) return 'baseline';
    if (/^(?:at\s+)?(?:baseline|pre[-\s]?(?:treatment|intervention)|before (?:treatment|intervention)|ベースライン|介入前|治療前)(?:\s*\([^)]*\))?$/.test(t) || /^(?:0\s*(?:weeks?|days?|months?|years?)?|(?:week|day|month|year)\s*0)$/.test(t)) return 'baseline';
    return 'unspecified';
  }
  const baseline = text => timePhase(text)==='baseline';
  function isBaselineRow(row) {
    const phase=timePhase(row.timepoint);
    if (phase==='post'||phase==='change'||/change/i.test(row.resultType||'')) return false;
    return phase==='baseline'||/^(?:baseline|pre[- ]?(?:treatment|intervention))$/i.test(row.resultType||'');
  }
  const name = o => o.reportedName || o.conceptCandidate || o.id;
  const textOf = o => [name(o), o.conceptCandidate, o.instrument].join(' ');
  const refs = row => [...new Set(Object.values(row.sourceRefs || {}).filter(Boolean))];
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const number = n => finite(n) ? String(n) : '—';
  function formatValue(row) {
    const s = row.statistics || {};
    if (finite(s.events) && finite(s.total)) return `${s.events}/${s.total}`;
    if (finite(s.mean)) return finite(s.sd) ? `${number(s.mean)} (${number(s.sd)})` : `${number(s.mean)}${finite(s.se) ? ' (SE ' + number(s.se) + ')' : ''}`;
    if (finite(s.estimate)) {
      if (/percent|percentage|%/i.test([row.resultType, row.effectMeasure, row.unit, s.unit, s.measure, s.effectMeasure].join(' ')) && !finite(s.ciLow)) return `${number(s.estimate)}%`;
      return `${number(s.estimate)}${finite(s.ciLow) && finite(s.ciHigh) ? ' [' + number(s.ciLow) + ', ' + number(s.ciHigh) + ']' : ''}`;
    }
    if (finite(s.eventCount)) return `${number(s.eventCount)}${finite(s.personTime) ? '/' + number(s.personTime) : ''}`;
    if (finite(s.n)) return `n=${number(s.n)}`;
    if (finite(s.events)) return `${number(s.events)}/?`;
    if (finite(s.total)) return `?/${number(s.total)}`;
    return '未報告';
  }
  function sourceAnchor(source, raw, scope = 'value') {
    if (!source) return null;
    return {
      pdfId: raw.pdfId, pdfFile: source.pdfFile || '', pageIndex: source.pdfPage - 1,
      pdfPage: source.pdfPage, printedPage: source.printedPage || null,
      sourceType: /VISUAL|FIGURE/i.test(source.kind) || /fig(?:ure)?\.?/i.test(source.tableFigure || '') ? 'figure' : /TABLE/i.test(source.kind) ? 'table' : 'text',
      label: source.tableFigure || '', section: source.section || '', row: source.row || '', column: source.column || '',
      valueText: source.directValue || '', sourceText: source.evidenceText || '',
      selectionId: source.selectionId || null, rects: [], resolutionStatus: 'unresolved', scope, sourceId: source.id
    };
  }
  function category(o, rows) {
    const text = textOf(o);
    if (/follow.?up.*(?:participants?|denominator|analysis.*n\b)|(?:participants?|denominator).*(?:follow.?up)|analysis sample size|追跡.*人数/i.test(text)) return 'denominator';
    if (/adherence|attendance|attended|visits completed|completion.*visits|reason.*(?:visits|sessions)|(?:correct|accurate).*(?:treatment|allocation).*guess|(?:blinding|masking).*(?:success|assessment)|遵守|出席|割付.*正答/i.test(text)) return 'conduct';
    if (/adjusted.*(?:difference|effect|\bMD\b)|number.*needed.*treat|\bNNT\b|\bp.?value\b|analysis model/i.test(text)) return 'effect';
    if (rows.length && rows.every(isBaselineRow) && o.timepoints?.every(baseline)) return 'baseline';
    return 'clinical';
  }
  const stop = new Set('adjusted mean difference differences effect effects number needed to treat nnt score scores change endpoint from baseline outcome primary in at the of and for a an with versus vs improvement clinically meaningful responder proportion participants patients achieving least points reduction response treatment'.split(' '));
  const tokens = o => [...new Set([...norm(textOf(o)).split(' ').filter(t => t.length > 2 && !stop.has(t)), ...(/roland|disability|\bfunction\b/i.test(textOf(o)) ? ['_function'] : [])])];
  function effectParent(effect, clinical) {
    let candidates = clinical;
    if (/\bnnt\b|number.*needed.*treat/i.test(textOf(effect))) candidates = clinical.filter(c => /responder|improv|reduction|≥|>=/i.test(textOf(c)));
    const wanted = tokens(effect), scores = candidates.map(c => ({id:c.id, score:tokens(c).filter(t => wanted.includes(t)).length})).sort((a,b) => b.score-a.score);
    return scores[0]?.score > 0 && scores[0].score > (scores[1]?.score || 0) ? scores[0].id : null;
  }
  function isPrimary(o, sources) {
    if (/primary/i.test(o.mapping?.relation || '') || /^primary\b/i.test(o.mapping?.reason || '') || /primary outcome/i.test(name(o))) return true;
    if (o.dataType === 'binary' && /responder|improv|reduction|≥|>=/i.test(textOf(o))) return false;
    const keys = tokens(o).filter(t => !['back','related','study','group','participants'].includes(t));
    const alias = o.dataType === 'continuous' && /disability|roland/i.test(name(o)) ? /dysfunction|disability|roland/i : null;
    return sources.some(s => [...(s.evidenceText || '').matchAll(/primary outcomes?\s+(?:were|was|are|is|include[sd]?|:)\s*([^.!?]{5,260})/gi)].some(m => {
      const words = norm(m[1]).split(' ');
      return keys.filter(k => words.includes(k)).length >= 2 || !!alias?.test(m[1]);
    }));
  }
  function priority(o, sources, context, outcomeSources=[]) {
    const target = o.mapping?.target && ['EXACT','COMPATIBLE'].includes(o.mapping?.relation);
    const requested = (context?.outcomes || []).some(t => norm(t) === norm(name(o)) || norm(t) === norm(o.conceptCandidate));
    const abstractResult = outcomeSources.some(s => /abstract/i.test(s.section||'') && /results?|main findings?/i.test([s.section,s.row].join(' ')));
    if (target || requested || isPrimary(o, sources) || abstractResult) return 'A';
    if (/cost|health.?care.*(?:use|utili)|physician|physical therap.*visit|medication|work|bed.?rest|days.*(?:activity|activities|bed)|complementary.*provider|cam.*(?:visit|use)|exploratory/i.test(textOf(o))) return 'C';
    return 'B';
  }
  function issues(study) {
    const values = [...new Set([...(study.raw.limitations || []), ...(study.analysisReadyCandidates || []).flatMap(c => c.issues || [])])];
    const rules = [
      ['denominator', '分母・解析集団', /denominator|population|sample size|\bn\b|分母|解析集団|人数/i],
      ['source', '図からの読取・出典確認', /source|trace|visual|figure|caption|quote|図|出典|読取/i],
      ['statistics', '不足統計量・値の扱い', /missing|not.report|statistic|\bsd\b|\bse\b|percent|estimate|未報告|統計|欠損|標準偏差/i],
      ['mapping', 'Outcome・時点・比較の選択', /mapping|time|baseline|adjust|compar|outcome|時点|群|比較|対応/i]
    ];
    const groups = new Map();
    for (const value of values) {
      const rule = rules.find(r => r[2].test(value)) || ['other','その他の確認'];
      if (!groups.has(rule[0])) groups.set(rule[0], {id:rule[0], label:rule[1], items:[]});
      groups.get(rule[0]).items.push(value);
    }
    return [...groups.values()];
  }
  function build(study, context = {}) {
    const raw = study.raw, sources = new Map(raw.sources.map(s => [s.id,s]));
    const rawViews = raw.rawValues.map(row => {
      const anchors = refs(row).map(id => sourceAnchor(sources.get(id), raw)).filter(Boolean);
      let display = formatValue(row);
      const reportedPair = anchors.map(a=>a.valueText.trim()).find(t=>/^[-−]?\d+(?:\.\d+)?\s*\(\s*\d+(?:\.\d+)?\s*\)$/.test(t) && (()=>{const n=t.replace(/−/g,'-').match(/-?\d+(?:\.\d+)?/g).map(Number);return n[0]===row.statistics?.mean&&n[1]===row.statistics?.sd;})());
      if (reportedPair) display = reportedPair.replace(/\s+/g,' ');
      // Keep a reported percentage as a percentage, without back-calculating events.
      if (finite(row.statistics?.estimate) && !finite(row.statistics?.ciLow) && anchors.some(a => /^\s*[\d.]+\s*%\s*$/.test(a.valueText))) display = `${row.statistics.estimate}%`;
      const mainRef=['mean','estimate','events','eventCount','n','sd','se','ciLow','ciHigh','total','ciLevel'].map(k=>row.sourceRefs?.[k]).find(Boolean);
      return {raw:row, sourceAnchor:anchors.find(a=>a.sourceId===mainRef) || anchors[0] || null, sourceAnchors:anchors, display};
    });
    const entries = raw.outcomes.map(o => {
      const rows = rawViews.filter(r => r.raw.outcomeId === o.id);
      const reviewMapping=ico.outcome(o,context);
      return {...o, reviewMapping, presentationCategory:category(o, rows.map(r=>r.raw)), rows, variants:[], priority:reviewMapping?'A':priority(o,raw.sources,context,rows.flatMap(r=>r.sourceAnchors).map(a=>sources.get(a.sourceId)))};
    });
    const clinical = entries.filter(o => o.presentationCategory === 'clinical');
    for (const variant of entries.filter(o => o.presentationCategory === 'effect')) {
      const parent = clinical.find(c => c.id === effectParent(variant,clinical));
      if (parent) { parent.variants.push(variant); variant.parentOutcomeId = parent.id; }
    }
    for (const o of clinical) {
      const eligible = o.rows.filter(r => !isBaselineRow(r.raw));
      const representative = [...(eligible.length ? eligible : o.rows)].sort((a,b) =>
        (a.sourceAnchor?.sourceType === 'table' ? 0 : 1) - (b.sourceAnchor?.sourceType === 'table' ? 0 : 1)).find(r=>r.sourceAnchor);
      o.sourceAnchor = representative ? {...representative.sourceAnchor, scope:'outcome', valueText:'', column:''} : null;
      o.nMissing = o.dataType === 'continuous' && eligible.some(r => !finite(r.raw.statistics.n));
      o.followUpRows = eligible; o.baselineRows = o.rows.filter(r => isBaselineRow(r.raw));
    }
    const secondary = clinical.filter(o => o.priority === 'B').sort((a,b) => {
      const rank = o => /responder|≥|>=|improv.*(?:point|%)/i.test(textOf(o)) ? 0 : /adverse|safety|harm|death/i.test(textOf(o)) ? 1 : 2;
      return rank(a)-rank(b);
    });
    const shownB = secondary.slice(0,5), other = clinical.filter(o => o.priority === 'C' || (o.priority === 'B' && !shownB.includes(o)));
    return {version:VERSION, raw, rawViews, clinical, primary:clinical.filter(o=>o.priority==='A'), secondary:shownB, other,
      metadata:entries.filter(o=>o.presentationCategory!=='clinical'), issueGroups:issues(study),
      study, context, rawCount:raw.rawValues.length};
  }
  return Object.freeze({VERSION, norm, baseline, timePhase, isBaselineRow, name, textOf, refs, formatValue, sourceAnchor, category, effectParent, build});
});
