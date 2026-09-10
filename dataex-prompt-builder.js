/* SR Data Extraction Prompt Builder. Configuration only; no PDF access or AI calls. */
(function (root, factory) {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./dataex-core-prompt.js') : root.DataExCorePrompt;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.DataExPromptBuilder = api;
    api.mount(document);
  }
})(typeof window === 'object' ? window : globalThis, function (core) {
  'use strict';
  const BUILDER_VERSION = '1.0.0';
  const STORAGE_KEY = 'dataex:prompt-builder:v1';
  const STUDY_DESIGNS = Object.freeze([
    ['auto', 'AIに自動判定'], ['parallel-rct', '並行群RCT'], ['crossover-rct', 'クロスオーバーRCT'],
    ['cluster-rct', 'クラスターRCT'], ['within-person-rct', 'split-mouth / within-person RCT'],
    ['prospective-cohort', '対照群あり前向きコホート'], ['retrospective-cohort', '対照群あり後ろ向きコホート'],
    ['other-comparative', 'その他の比較研究']
  ].map(Object.freeze));
  const DATA_TYPES = Object.freeze(['continuous', 'binary', 'change score', 'count/rate', 'time-to-event', 'comparative effect']);
  const STATISTICS = Object.freeze(Object.fromEntries(Object.entries({
    continuous: ['mean', 'SD', 'SE', 'n', 'change mean', 'change SD'],
    binary: ['events', 'total'], 'change score': ['change mean', 'change SD', 'SE', 'n'],
    'count/rate': ['event count', 'person-time', 'rate', 'rate ratio', '95% CI'],
    'time-to-event': ['HR', '95% CI'],
    'comparative effect': ['MD', 'SMD', 'RR', 'OR', 'HR', 'SE', '95% CI']
  }).map(([key, values]) => [key, Object.freeze(values)])));
  const TIME_ORIGINS = Object.freeze(['randomization', 'treatment start', 'treatment end', 'surgery', 'baseline', 'other']);
  const TIME_RULES = Object.freeze(['latest eligible', 'earliest eligible', 'closest to target', 'all candidates']);
  const OUTCOME_FIELDS = ['timepoint', 'analysisUnit', 'populationRule', 'dataType', 'requestedStatistics', 'scale', 'timeOrigin', 'timeSelectionRule', 'extraRules'];
  const INPUTS = Object.freeze({studyDesign: 'builder-study-design', intervention: 'intervention', comparator: 'comparator',
    timepoint: 'timepoint', analysisUnit: 'builder-analysis-unit', nodeRule: 'builder-node-rule', populationRule: 'population-rule',
    dataType: 'builder-data-type', scale: 'builder-scale', timeOrigin: 'builder-time-origin',
    timeSelectionRule: 'builder-time-rule', extraRules: 'extra-rules'});
  const text = value => typeof value === 'string' ? value.trim() : '';
  const option = (value, values, fallback = '') => values.includes(value) ? value : fallback;
  const statsFor = type => STATISTICS[type] || [...new Set(Object.values(STATISTICS).flat())];
  const statistics = (value, type) => [...new Set((Array.isArray(value) ? value : []).filter(x => statsFor(type).includes(x)))];

  // Outcome objects carry their own settings so a later card UI can override each field.
  // An explicitly empty outcome field is retained; omitted fields inherit common settings.
  function configuration(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
    const result = {
      studyDesign: option(input.studyDesign, STUDY_DESIGNS.map(x => x[0]), 'auto'),
      intervention: text(input.intervention), comparator: text(input.comparator), outcomes: [],
      timepoint: text(input.timepoint), analysisUnit: text(input.analysisUnit), nodeRule: text(input.nodeRule),
      populationRule: text(input.populationRule), dataType: option(input.dataType, DATA_TYPES),
      requestedStatistics: [], scale: text(input.scale), timeOrigin: option(input.timeOrigin, TIME_ORIGINS),
      timeSelectionRule: option(input.timeSelectionRule, TIME_RULES), extraRules: text(input.extraRules)
    };
    result.requestedStatistics = statistics(input.requestedStatistics, result.dataType);
    const entries = typeof input.outcomes === 'string' ? input.outcomes.split(/\r?\n/) : Array.isArray(input.outcomes) ? input.outcomes : [];
    for (const entry of entries) {
      const raw = typeof entry === 'string' ? {name: entry} : entry;
      if (!raw || !text(raw.name)) continue;
      const outcome = {id: `O${result.outcomes.length + 1}`, name: text(raw.name)};
      for (const field of OUTCOME_FIELDS) outcome[field] = Object.hasOwn(raw, field) ? raw[field] : result[field];
      outcome.dataType = option(outcome.dataType, DATA_TYPES);
      outcome.requestedStatistics = statistics(outcome.requestedStatistics, outcome.dataType);
      outcome.timeOrigin = option(outcome.timeOrigin, TIME_ORIGINS);
      outcome.timeSelectionRule = option(outcome.timeSelectionRule, TIME_RULES);
      for (const field of OUTCOME_FIELDS.filter(k => !['requestedStatistics', 'dataType', 'timeOrigin', 'timeSelectionRule'].includes(k))) outcome[field] = text(outcome[field]);
      result.outcomes.push(outcome);
    }
    return result;
  }

  function warnings(config) {
    const issues = [];
    if (!config.intervention) issues.push('Interventionが未指定です。');
    if (!config.comparator) issues.push('Comparatorが未指定です。');
    if (!config.outcomes.length) issues.push('Outcomeが未指定です。');
    for (const outcome of config.outcomes) {
      const missing = [];
      const namedTime = /(?:\d\s*(?:days?|weeks?|months?|years?|日|週|か月|年)|(?:week|wk)\s*\d|(?:entire |during (?:the )?)?study period|試験期間|研究期間)/i.test(outcome.name);
      const namedScale = /(?:0\s*[-–—〜～]\s*(?:10|100)|ETDRS|\bmm\b)/i.test(outcome.name);
      if (!outcome.timepoint && !namedTime) missing.push('時点');
      if (['', 'continuous', 'change score'].includes(outcome.dataType) && !outcome.scale && !namedScale) missing.push('尺度・単位');
      if (missing.length) issues.push(`${outcome.id}：${missing.join('、')}が未指定です。`);
    }
    return issues;
  }

  function generate(input) {
    const config = configuration(input);
    const specified = value => value || '未指定';
    const outcomes = config.outcomes.map(o => [
      `### ${o.id}: ${o.name}`, `- Data type: ${specified(o.dataType)}`,
      `- Requested statistics: ${o.requestedStatistics.length ? o.requestedStatistics.join(', ') : '未指定'}`,
      `- Timepoint / target window: ${specified(o.timepoint)}`, `- Analysis unit: ${specified(o.analysisUnit)}`,
      `- Analysis population / denominator: ${specified(o.populationRule)}`, `- Scale / unit: ${specified(o.scale)}`,
      `- Time origin: ${specified(o.timeOrigin)}`, `- Time selection rule: ${specified(o.timeSelectionRule)}`,
      `- Outcome extra rules: ${specified(o.extraRules)}`
    ].join('\n')).join('\n\n');
    const values = {
      STUDY_DESIGN: STUDY_DESIGNS.find(x => x[0] === config.studyDesign)[1], ANALYSIS_UNIT: specified(config.analysisUnit),
      INTERVENTION: specified(config.intervention), COMPARATOR: specified(config.comparator),
      NODE_RULE: specified(config.nodeRule), POPULATION_RULE: specified(config.populationRule),
      OUTCOMES: [
        '### 共通設定', `- Timepoint / target window: ${specified(config.timepoint)}`,
        `- Data type: ${specified(config.dataType)}`, `- Requested statistics: ${config.requestedStatistics.join(', ') || '未指定'}`,
        `- Scale / unit: ${specified(config.scale)}`, `- Time origin: ${specified(config.timeOrigin)}`,
        `- Time selection rule: ${specified(config.timeSelectionRule)}`, '', outcomes || '未指定（アウトカムを確認してください）'
      ].join('\n'), EXTRA_RULES: config.extraRules || '追加指定なし',
      FLAGS: '追加の実行フラグ指定なし。未指定のレビュー条件は未指定として扱う。資料は利用者が明示的に提供・許可したものだけを使用する。'
    };
    // One pass: literal $&, braces and template-looking user text are not re-interpolated.
    const prompt = core.CORE_PROMPT_TEMPLATE.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key) => {
      if (!Object.hasOwn(values, key)) throw new Error(`Core Promptの未対応項目：${key}`);
      return values[key];
    });
    return {builderVersion: BUILDER_VERSION, corePromptVersion: core.CORE_PROMPT_VERSION, configuration: config, prompt, warnings: warnings(config)};
  }

  function exportConfiguration(config) {
    return {schemaVersion: 1, builderVersion: BUILDER_VERSION, corePromptVersion: core.CORE_PROMPT_VERSION, reviewConfiguration: configuration(config)};
  }

  function mount(doc) {
    const $ = id => doc.getElementById(id), form = $('conditions');
    if (!form || !core) return;
    const selectOptions = (id, choices, emptyLabel) => {
      const node = $(id);
      if (emptyLabel) node.append(new Option(emptyLabel, ''));
      for (const choice of choices) node.append(new Option(Array.isArray(choice) ? choice[1] : choice, Array.isArray(choice) ? choice[0] : choice));
    };
    selectOptions('builder-study-design', STUDY_DESIGNS);
    selectOptions('builder-data-type', DATA_TYPES, '未指定');
    selectOptions('builder-time-origin', TIME_ORIGINS, '未指定');
    selectOptions('builder-time-rule', TIME_RULES, '未指定');
    const renderStatistics = selected => {
      $('builder-statistics').replaceChildren();
      for (const value of statsFor($('builder-data-type').value)) {
        const label = doc.createElement('label'), checkbox = doc.createElement('input');
        checkbox.type = 'checkbox'; checkbox.value = value; checkbox.name = 'requested-statistic'; checkbox.checked = selected.includes(value);
        label.append(checkbox, doc.createTextNode(value)); $('builder-statistics').append(label);
      }
    };
    const readStatistics = () => [...$('builder-statistics').querySelectorAll('input:checked')].map(x => x.value);
    const collect = () => configuration({...Object.fromEntries(Object.entries(INPUTS).map(([key, id]) => [key, $(id).value])),
      outcomes: $('outcomes').value, requestedStatistics: readStatistics()});
    renderStatistics([]);
    let generated = null;
    const status = message => { $('builder-status').textContent = message; };
    function save() {
      try {
        // Store only allowlisted configuration and UI state. Never persist generated/core text or PDF context.
        const origins = window.dataexReviewProfile?.context().origins || {};
        const profileFields = ['outcomes', 'timepoint', 'population-rule'].filter(id => origins[id] === 'profile');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({version: 1, reviewConfiguration: collect(),
          ui: {advancedOpen: $('builder-advanced').open, profileFields}}));
      } catch (_) { status('設定をブラウザに保存できません。設定JSON保存をご利用ください。'); }
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw && raw.length <= 2000000 ? JSON.parse(raw) : null;
      if (saved?.version === 1 && saved.reviewConfiguration) {
        const config = configuration(saved.reviewConfiguration), inherited = Array.isArray(saved.ui?.profileFields) ? saved.ui.profileFields : [];
        for (const [key, id] of Object.entries(INPUTS)) if (!inherited.includes(id) && !$(id).value.trim()) $(id).value = config[key];
        // Select elements have a default; restore their explicit saved choices as well.
        $('builder-study-design').value = config.studyDesign;
        if (!inherited.includes('outcomes') && !$('outcomes').value.trim()) $('outcomes').value = config.outcomes.map(o => o.name).join('\n');
        renderStatistics(config.requestedStatistics);
        $('builder-advanced').open = saved.ui?.advancedOpen === true;
      }
    } catch (_) { status('保存設定を読み込めませんでした。現在の入力から生成できます。'); }
    // This script mounts before the existing PDF/result restoration. That restoration remains authoritative.
    function refreshSummary() {
      const count = collect().outcomes.length;
      $('builder-outcome-summary').textContent = count ? `${count}件のOutcome（O1${count > 1 ? `〜O${count}` : ''}）にAdvancedの共通設定を適用します。` : 'Outcomesは1行につき1件です。Advancedの共通設定を各Outcomeに適用します。';
    }
    function generatePanel() {
      generated = generate(collect());
      $('builder-version').textContent = `Core Prompt v${generated.corePromptVersion} · Builder v${generated.builderVersion}`;
      $('builder-prompt').value = generated.prompt;
      $('builder-warning').hidden = !generated.warnings.length;
      $('builder-warning').textContent = generated.warnings.length ? '候補抽出は可能ですが、最終analysis-ready値を一意に決められない可能性があります。\n' + generated.warnings.join('\n') : '';
      $('builder-result').hidden = false;
      $('builder-stale').hidden = true;
      status('プロンプトを生成しました。AI処理は実行していません。');
      refreshSummary(); save();
      return generated;
    }
    const currentOutput = () => !generated || JSON.stringify(collect()) !== JSON.stringify(generated.configuration) ? generatePanel() : generated;
    form.addEventListener('submit', event => {
      event.preventDefault();
      generatePanel();
      $('builder-result').scrollIntoView({block: 'nearest'});
      $('builder-prompt').focus({preventScroll: true});
    });
    form.addEventListener('input', () => {
      refreshSummary(); save();
      if (generated) $('builder-stale').hidden = JSON.stringify(collect()) === JSON.stringify(generated.configuration);
    });
    $('builder-data-type').addEventListener('change', () => {renderStatistics(readStatistics()); save();});
    $('builder-advanced').addEventListener('toggle', save);
    window.addEventListener('pagehide', save);
    $('builder-copy').addEventListener('click', async () => {
      const output = currentOutput();
      try {
        await navigator.clipboard.writeText(output.prompt);
        status('プロンプト全文をコピーしました。');
      } catch (_) {
        const area = $('builder-prompt'); area.focus(); area.select(); area.setSelectionRange(0, area.value.length);
        let copied = false;
        try { copied = doc.execCommand('copy'); } catch (_) { /* Leave the entire text selected for manual copy. */ }
        status(copied ? 'プロンプト全文をコピーしました（代替方式）。' : '全文を選択しました。Ctrl+C（Macでは⌘C）でコピーしてください。');
      }
    });
    function download(contents, name, type) {
      const url = URL.createObjectURL(new Blob([contents], {type})), anchor = doc.createElement('a');
      anchor.href = url; anchor.download = name; anchor.hidden = true; doc.body.append(anchor);
      try { anchor.click(); status(`${name}の保存を開始しました。`); }
      finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
    }
    $('builder-save-txt').addEventListener('click', () => {const output = currentOutput(); download(output.prompt, 'DataEx-extraction-prompt.txt', 'text/plain;charset=utf-8');});
    $('builder-save-json').addEventListener('click', () => {const output = currentOutput(); download(JSON.stringify(exportConfiguration(output.configuration), null, 2), 'DataEx-review-configuration.json', 'application/json;charset=utf-8');});
    refreshSummary();
    doc.addEventListener('DOMContentLoaded', refreshSummary, {once: true});
  }
  return Object.freeze({BUILDER_VERSION, STORAGE_KEY, STUDY_DESIGNS, DATA_TYPES, STATISTICS, TIME_ORIGINS, TIME_RULES,
    configuration, warnings, generate, exportConfiguration, mount});
});
