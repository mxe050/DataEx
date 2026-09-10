/* Phase 2: bounded local PDF reading and structured result display. No LLM API. */
'use strict';
window.createDataExExtraction = function ({ $, state, getState, pageData, pageNumber, checkReady, checkGeneration, normalize, focusEvidence, tool, schema, message }) {
  const requestText = 'このDataExを抽出してください。結果はDataExの結果欄に表示し、チャットには要確認事項だけ簡潔に示してください。';
  const readyStates = ['READY', 'READY_DERIVED', 'READY_WITH_ASSUMPTION'];
  const statuses = [...readyStates, 'CANDIDATE_ONLY', 'NEEDS_REVIEW', 'NOT_REPORTED', 'NOT_FOUND', 'NOT_DERIVABLE', 'NEEDS_VISUAL_REVIEW'];
  const compatibilityLabels = { EXACT:'完全一致', COMPATIBLE:'概念一致', DERIVABLE:'算出可能', RELATED_ONLY:'関連データのみ', NONE:'該当報告なし', AMBIGUOUS:'複数候補' };
  const actionFor = status => readyStates.includes(status) ? 'USE' : ['NOT_REPORTED','NOT_FOUND','NOT_DERIVABLE'].includes(status) ? 'DO_NOT_USE' : 'REVIEW';
  const emptyAudit = () => ({searchComplete:false,queries:[],pagesChecked:[],sectionsChecked:[],relatedTermsFound:[],notes:null});
  let trace = {generation:state.generation,map:false,queries:new Set(),pages:new Set(),relevantPages:new Set()};
  function searchTrace() { if(trace.generation!==state.generation) trace={generation:state.generation,map:false,queries:new Set(),pages:new Set(),relevantPages:new Set()}; return trace; }
  const protocol = [
    '指定outcomeの解析値を抽出し、compatibilityをEXACT/COMPATIBLE/DERIVABLE/RELATED_ONLY/NONE/AMBIGUOUSに分類する。',
    '分子・分母・時点・集団・解析単位を個別に解決し、解析値と関連データを分ける。',
    'direct author-reported値を優先。導出式・入力根拠・許容された仮定を明示する。',
    'NEEDS_REVIEWは複数候補・定義・集団・時点・source矛盾など人間の選択で解析値が変わる場合に限定する。',
    '関連データのみで要求値へ変換不能ならRELATED_ONLY + NOT_DERIVABLE。mean/medianからresponder人数を推測しない。',
    'specific AE countsから重複不明のunique participant any-AEを作らない。',
    'NOT_REPORTEDはNONEかつsearchComplete=true。map、複数query、関連Results/Table/Methodsの確認をsearchAuditに記録する。',
    '探索不足や必要な補足資料がなければNOT_FOUND。NOT_FOUNDを推測でNOT_REPORTEDへ昇格しない。',
    '短いPDFは該当しそうなResults/Table/Methodsを確認。長文はmapとtargeted searchでcoverageを記録する。',
    '数値の0と報告なしを区別。adjusted effectとraw varianceを無根拠に混ぜない。',
    '詳細Results/TableをAbstractより優先し、用途別sourceとrelatedEvidenceをPDFで照合する。',
    '画像を見たと主張しない。必要ならNEEDS_VISUAL_REVIEW。解析Statusと人間の確認状態は別に扱う。'
  ];
  const summaryProtocol = 'dataex_set_resultsが返したsummaryTextを意味変更せず、そのまま最終回答の主文として使用する。DO_NOT_USEを「要確認」と言い換えない。Human reviewが未確認でも要確認件数に数えない。長い説明はユーザーが求めた場合だけ。';
  function summarize(outcomes) {
    const summaryCounts={use:0,review:0,doNotUse:0,total:outcomes.length};
    const keys={USE:'use',REVIEW:'review',DO_NOT_USE:'doNotUse'};
    for(const outcome of outcomes) {const key=keys[outcome.analysisAction];if(!key)fail('analysisActionが未確定です。');summaryCounts[key]++;}
    const parts=['解析投入可'+summaryCounts.use+'件'];
    if(summaryCounts.review)parts.push('要確認'+summaryCounts.review+'件');
    if(summaryCounts.doNotUse)parts.push('解析投入不可'+summaryCounts.doNotUse+'件');
    return {summaryCounts,summaryText:'DataExに'+summaryCounts.total+'アウトカムを表示しました。'+parts.join('、')+'です。'};
  }
  let confirmedSummary=null;
  const workflow = '「このDataExを抽出してください」の依頼ではbrief → document map → outcomeごとの複数query検索 → 必要ページのtext → 分子/分母/時点/集団の個別解決 → 根拠再照合 → set_results。最終回答の主文はset_resultsが返すsummaryTextをそのまま使う。';
  const hierarchy = '採用anchorは通常 detailed Results/Table/Figure > Methods definition > Abstract。定義にはMethods/Abstractが適切な場合もある。用途別sourceを分ける。Phase 2ではテキスト層のみを扱い、画像・曲線を見たと主張しない。';
  const str = (maxLength = 2000) => ({ type: 'string', maxLength });
  const nullable = (maxLength = 2000) => ({ type: ['string', 'null'], maxLength });
  const num = { type: ['number', 'null'] };
  const list = (items, maxItems, minItems = 0) => ({ type: 'array', items, maxItems, minItems });
  const object = properties => schema(properties, Object.keys(properties));
  const armSchema = object({ name: str(200), valueText: str(1000), numerator: num, denominator: num, mean: num, sd: num, se: num });
  const effectSchema = { ...object({ measure: nullable(200), estimate: num, ciLow: num, ciHigh: num, se: num }), type: ['object', 'null'] };
  const traceInputSchema=object({name:str(40),value:{type:'number'},sourceRef:str(200)});
  const traceOutputSchema=object({name:str(40),value:{type:'number'},unit:nullable(100)});
  const linkageSchema=object({study:str(500),arm:str(200),outcome:str(500),measure:str(500),timepoint:str(300),population:str(500),meanSourceRef:str(200),populationSourceRefs:list(str(200),20,1),seriesSourceRefs:list(str(200),20),rationale:str(3000)});
  const calculationSchema=object({arm:str(200),inputs:list(traceInputSchema,10,1),output:traceOutputSchema,linkage:linkageSchema});
  const derivationSchema={...schema({label:str(300),formula:str(1000),inputs:list({anyOf:[str(500),traceInputSchema]},40),output:traceOutputSchema,arm:str(200),linkage:linkageSchema,calculations:list(calculationSchema,20,1),assumption:nullable(1000)},['label','formula','inputs','assumption']),type:['object','null']};
  const sourceContextSchema=object({study:str(500),arms:list(str(200),20,1),measure:str(500),timepoint:str(300),population:str(500),scope:{type:'string',enum:['TARGET_TIMEPOINT','SERIES','UNKNOWN']},seriesId:str(200),statistic:{type:'string',enum:['OBSERVED','MODEL_BASED','UNKNOWN']},nBasis:{type:'string',enum:['OUTCOME_OBSERVED','RANDOMIZED','BASELINE','COMPLETER','UNKNOWN','NOT_APPLICABLE']}});
  const sourceSchema = object({ use: { type: 'string', enum: ['numerator', 'denominator', 'n', 'mean', 'sd', 'se', 'effect', 'timepoint', 'population', 'definition', 'other'] }, page: { type: 'integer', minimum: 1 }, printedPage: nullable(40), section: nullable(200), tableFigure: nullable(200), row: nullable(200), column: nullable(200), evidenceText: str(3000), focusQuery: str(200), verification: { type: 'string', enum: ['SOURCE_VERIFIED_TEXT', 'DERIVED', 'UNRESOLVED'] } });
  Object.assign(sourceSchema.properties,{sourceId:str(200),source_type:{type:'string',enum:['TEXT','TABLE','FIGURE_CAPTION','FIGURE_DERIVED']},context:sourceContextSchema});
  const relatedSchema = object({label:str(300),valueText:nullable(1000),page:{type:'integer',minimum:1},section:nullable(200),evidenceText:str(3000),focusQuery:str(200)});
  const searchAuditSchema = schema({searchComplete:{type:'boolean'},queries:list(str(200),100),pagesChecked:list({type:'integer',minimum:1},500),sectionsChecked:list(str(200),100),relatedTermsFound:list(str(200),100),notes:nullable(3000)},['searchComplete','queries','pagesChecked','sectionsChecked','notes']);
  const outcomeSchema = object({ compatibility:{type:'string',enum:Object.keys(compatibilityLabels)},requestedValue:str(1000),relatedEvidence:list(relatedSchema,30),reason:str(3000),analysisAction:{type:'string',enum:['USE','DO_NOT_USE','REVIEW']},searchAudit:searchAuditSchema, outcome: str(500), timepoint: nullable(300), population: nullable(500), analysisUnit: nullable(200), variableType: { type: 'string', enum: ['binary', 'continuous', 'effect', 'other'] }, status: { type: 'string', enum: statuses }, arms: list(armSchema, 20), effect: effectSchema, derivation: derivationSchema, sources: list(sourceSchema, 30), note: nullable(3000), reviewFlags: list(str(500), 30) });
  const compositeCountSchema=object({arm:str(200),events:{type:'integer',minimum:0},denominator:{type:'integer',minimum:1}});
  const compositeComponentSchema=schema({name:str(500),countsByArm:list(compositeCountSchema,20,1),semanticCompatibility:{type:'string',enum:['EXACT','COMPATIBLE','AMBIGUOUS','RELATED_ONLY']},sourceRefs:list(str(200),30,1),study:str(500),analysisUnit:str(100),population:str(500),timeWindow:str(300),semanticReason:str(2000),semanticSourceRefs:list(str(200),20,1)},['name','countsByArm','semanticCompatibility','sourceRefs']);
  outcomeSchema.properties.compositeAudit=object({components:list(compositeComponentSchema,10,2),overlapStatus:{type:'string',enum:['PROVEN_DISJOINT','KNOWN_OVERLAP','UNKNOWN','NOT_APPLICABLE']},rangeAllowed:{type:'boolean'},ranges:list(object({arm:str(200),lower:{type:'integer',minimum:0},upper:{type:'integer',minimum:0},denominator:{type:'integer',minimum:1}}),20),reason:str(3000)});
  const resultSchema = object({ study: str(500), summaryStatus: { type: 'string', enum: ['READY', 'PARTIAL', 'NEEDS_REVIEW'] }, outcomes: list(outcomeSchema, 50, 1), unresolved: list(object({ issue: str(1000), impact: str(1000), outcome: nullable(500) }), 50) });
  // Only old storage records are migrated. New tool submissions must supply the extended schema.
  function migrate(record) {
    if(record.version===2) return record;
    for(const o of record.results?.outcomes || []) {
      o.compatibility = o.status==='READY_DERIVED' ? 'DERIVABLE' : readyStates.includes(o.status) ? 'EXACT' : o.status==='NOT_DERIVABLE' ? 'RELATED_ONLY' : ['NOT_FOUND','NOT_REPORTED'].includes(o.status) ? 'NONE' : 'AMBIGUOUS';
      o.requestedValue=o.outcome; o.reason=o.note || '旧保存結果です。探索記録は保存されていません。';
      o.relatedEvidence=o.status==='NOT_DERIVABLE' ? o.sources.filter(x=>x.verification!=='UNRESOLVED').map(x=>({label:x.section||'関連する原著',valueText:null,page:x.page,section:x.section,evidenceText:x.evidenceText,focusQuery:x.focusQuery})) : [];
      o.searchAudit=emptyAudit();
      if(o.status==='NOT_REPORTED') {o.status='NOT_FOUND';o.reason+=' 探索完了を検証できないため、未発見・追加探索として復元しました。';}
      o.analysisAction=actionFor(o.status);
    }
    for(const entry of record.reviews || []) if(entry[1]?.state==='NEEDS_REVIEW') entry[1].state='REVIEW_REQUIRED';
    record.version=2; return record;
  }
  function resolveOutcome(o, liveSearch) {
    if(!o.requestedValue.trim()) fail(o.outcome+': 指定値を明記してください。');
    if(o.status==='NEEDS_REVIEW' && !o.reason.trim()) fail(o.outcome+': NEEDS_REVIEWには採用値が変わる理由が必要です。');
    if(o.status==='NOT_REPORTED') {
      const a=o.searchAudit,t=searchTrace();
      if(o.compatibility!=='NONE'||a.searchComplete!==true) fail(o.outcome+': NOT_REPORTEDにはNONEとsearchComplete=trueが必要です。');
      if(new Set(a.queries.map(normalize)).size<2 || !a.pagesChecked.length || !a.sectionsChecked.some(x=>/results|table|methods|結果|表|方法/i.test(x))) fail(o.outcome+': 探索記録に複数queryと関連ページ・節が必要です。');
      if(liveSearch && (!t.map || a.queries.some(q=>!t.queries.has(normalize(q))) || a.pagesChecked.some(p=>!t.pages.has(p)) || [...t.relevantPages].some(p=>!a.pagesChecked.includes(p)||!t.pages.has(p)))) fail(o.outcome+': document map・記録された検索・関連Methods/Results/Tableページ本文の取得が未完了です。');
    }
    // Never promote NOT_FOUND to NOT_REPORTED from an assertion of completeness alone.
    if(o.compatibility==='RELATED_ONLY') o.status='NOT_DERIVABLE';
    else if(o.compatibility==='NONE' && o.status!=='NOT_REPORTED') o.status='NOT_FOUND';
    else if(o.compatibility==='AMBIGUOUS' && readyStates.includes(o.status)) fail(o.outcome+': 複数候補をREADYにできません。');
    if(o.status==='NOT_DERIVABLE' && o.compatibility!=='RELATED_ONLY') fail('NOT_DERIVABLEにはRELATED_ONLYを指定してください。');
    if(o.status==='NOT_FOUND' && o.compatibility!=='NONE') fail('NOT_FOUNDにはNONEを指定してください。');
    if(['NOT_FOUND','NOT_REPORTED','NOT_DERIVABLE'].includes(o.status)&&!o.reason.trim()) fail(o.outcome+': 判定理由を明記してください。');
    if(readyStates.includes(o.status)) {
      if(!o.timepoint?.trim()||!o.population?.trim()||!o.analysisUnit?.trim()) fail(o.outcome+': READYには時点・集団・解析単位の解決が必要です。');
      if(o.status==='READY' && !['EXACT','COMPATIBLE'].includes(o.compatibility)) fail('READYにはEXACTまたはCOMPATIBLEが必要です。');
      if(o.status==='READY_DERIVED' && o.compatibility!=='DERIVABLE') fail('READY_DERIVEDにはDERIVABLEが必要です。');
    }
    if(o.status==='CANDIDATE_ONLY' && !(o.effect?.estimate!=null || o.arms.some(a=>['numerator','mean'].some(k=>a[k]!=null) || (a.valueText.trim()&&!/未確認|不明|未発見|未報告|unknown|not found/i.test(a.valueText))))) fail('CANDIDATE_ONLYには実在する候補値が必要です。');
    o.analysisAction=actionFor(o.status);
  }
  let results = null, sourceChecks = [], reviews = new Map();
  const readPages = new Set();
  const formFields = ['intervention', 'comparator', 'outcomes', 'timepoint', 'population-rule', 'extra-rules'];
  const STORE_PREFIX = 'dataex:phase2.5:pdf:', LATEST_KEY = 'dataex:phase2.5:latest';
  let documentMeta = null, storageKey = null, pdfMatches = false, requestOrder = [], selectedSources = new Map();
  let focusSerial = 0, resultRevision = 0;
  const focusStates=new Map();
  const focusKey=a=>JSON.stringify([state.generation,a.page,a.focusQuery||a.query||a.evidenceText||'']);
  function positionText(anchor,fallback) {const result=focusStates.get(focusKey(anchor));return result ? result.ok&&result.highlightedCount>0?'✓ 根拠位置照合済み':'根拠位置未照合' : fallback;}
  window.addEventListener('dataex-evidence-focus',event=>{
    const {anchor,result}=event.detail,key=focusKey(anchor);focusStates.set(key,result);
    for(const node of document.querySelectorAll?.('[data-focus-key]')||[]) if(node.dataset.focusKey===key)node.textContent=positionText(anchor,'根拠位置未照合');
  });
  async function focusEvidenceAnchor(anchor) {
    const args={page:anchor.page};
    for(const k of ['focusQuery','evidenceText','row','column','use','valueText'])if(typeof anchor[k]==='string'&&anchor[k])args[k]=anchor[k];
    args.label=(anchor.section||anchor.label||useLabels[anchor.use]||'').slice(0,200);
    try {const r=await focusEvidence(args);focusStates.set(focusKey(anchor),r);return r;}
    catch(error) {const r={ok:false,highlightedCount:0,matchStatus:'NOT_FOUND'};focusStates.set(focusKey(anchor),r);message('evidence-message','⚠ 根拠位置未照合：'+error.message,true);return r;}
  }
  const formSnapshot = () => Object.fromEntries(formFields.map(id => [id, $(id).value]));
  const applyForm = form => formFields.forEach(id => { if (typeof form?.[id] === 'string') $(id).value = form[id].slice(0, id === 'outcomes' ? 8000 : 4000); });
  function storageWarning(text) { message('storage-message', text, true); }
  function persist() {
    if (!storageKey || !documentMeta) return;
    try {
      const record = { version: 2, documentMeta, profileContext: window.dataexReviewProfile?.context(), form: formSnapshot(), visualResults: window.dataexVisual?.snapshot(), results, sourceChecks, reviews: [...reviews], requestOrder };
      window.localStorage.setItem(storageKey, JSON.stringify(record));
      window.localStorage.setItem(LATEST_KEY, storageKey);
      message('storage-message', '');
    } catch (_) { storageWarning('このブラウザに保存できませんでした。再読み込みすると結果が失われます。'); }
  }
  function readRecord(key) {
    if (!key?.startsWith(STORE_PREFIX)) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > 1000000) return null;
    const record = migrate(JSON.parse(raw));
    if (record.version !== 2 || !record.documentMeta || typeof record.documentMeta.filename !== 'string' || !Number.isInteger(record.documentMeta.pageCount)) return null;
    const m = record.documentMeta;
    if (key !== keyFor(m)) return null;
    if (record.results) validate(record.results, resultSchema);
    return record;
  }
  function keyFor(m) { return STORE_PREFIX + encodeURIComponent(JSON.stringify([m.filename, m.size, m.lastModified, m.pageCount, m.pdfId])); }
  function adopt(record, key) {
    documentMeta = record.documentMeta; storageKey = key; results = record.results || null; window.dataexVisual?.restore(record.visualResults);
    sourceChecks = Array.isArray(record.sourceChecks) ? record.sourceChecks : [];
    requestOrder = Array.isArray(record.requestOrder) ? record.requestOrder.filter(x => typeof x === 'string').slice(0, 50) : [];
    reviews = new Map((Array.isArray(record.reviews) ? record.reviews : []).filter(entry => Array.isArray(entry) && Number.isInteger(entry[0]) && entry[0] >= 0 && entry[0] < (results?.outcomes.length || 0) && ['NOT_REVIEWED','ACCEPTED','CORRECTED','REVIEW_REQUIRED','REJECTED'].includes(entry[1]?.state)));
    selectedSources.clear(); applyForm(record.form); window.dataexReviewProfile?.restoreContext(record.profileContext,key); resultRevision++;
  }
  function restoreLatest() {
    try {
      const key = window.localStorage.getItem(LATEST_KEY), record = readRecord(key);
      if (!record) return;
      adopt(record, key); pdfMatches = false; render();
      if (results || window.dataexVisual?.outcomes().length) reviewMode(false);
      message('pdf-status', `保存結果: ${documentMeta.filename}\n${documentMeta.pageCount}ページ（PDF未読込）`);
    } catch (_) { storageWarning('保存データを復元できませんでした。PDFを選択して再開してください。'); }
  }
  function detachPdf() {
    persist(); pdfMatches = false; focusSerial++; $('evidence-navigation').replaceChildren(); render();
  }
  async function onPdfLoaded(file) {
    const generation = state.generation;
    const meta = { filename: file.name, size: file.size, lastModified: file.lastModified, pageCount: state.pdf.numPages, pdfId: state.pdf.fingerprints?.[0] || '' };
    const key = keyFor(meta);
    let record = null;
    try { record = readRecord(key); } catch (_) { storageWarning('保存結果を読み取れませんでした。'); }
    if (key !== storageKey) {
      window.dataexReviewProfile?.newPdf(key);
      if (record) adopt(record, key);
      else { window.dataexVisual?.clear(); results = null; sourceChecks = []; reviews.clear(); requestOrder = []; selectedSources.clear(); resultRevision++; window.dataexReviewProfile?.applyDefaults(false); }
    }
    documentMeta = meta; storageKey = key; pdfMatches = true;
    if (results) {
      // Stored verification never substitutes for a check against the reselected PDF.
      try { sourceChecks = (await audit(results, false)).checks; checkGeneration(generation); }
      catch (error) {
        checkGeneration(generation); pdfMatches = false; sourceChecks = [];
        storageWarning('保存結果の根拠を再照合できませんでした。再抽出してください。');
      }
    }
    render(); persist();
    if (results || window.dataexVisual?.outcomes().length) reviewMode(false);
    else { $('condition-content').hidden = false; $('review-header').hidden = true; }
  }
  function eraseResult() {
    // Remove only this PDF's record; leave other browser data and PDFs untouched.
    try {
      if (storageKey) window.localStorage.removeItem(storageKey);
      if (window.localStorage.getItem(LATEST_KEY) === storageKey) window.localStorage.removeItem(LATEST_KEY);
    } catch (_) { storageWarning('保存結果を消去できませんでした。ブラウザの保存設定を確認してください。'); return; }
    window.dataexVisual?.clear(); results = null; sourceChecks = []; reviews.clear(); requestOrder = []; selectedSources.clear(); resultRevision++; focusSerial++;
    storageKey = null; $('review-header').hidden = true; $('condition-content').hidden = false; $('evidence-navigation').replaceChildren();
    $('clear-highlight').click(); render();
  }
  function reviewMode(scroll = true) {
    $('condition-content').hidden = true; $('review-header').hidden = false;
    $('toggle-conditions').textContent = '抽出条件を表示'; $('toggle-conditions').setAttribute('aria-expanded', 'false');
    if (scroll) $('results-section').scrollIntoView?.({ block: 'start' });
  }
  function completeness() {
    const requested = requestOrder.length ? requestOrder : results?.outcomes.map(o => o.outcome) || [];
    return requested.map(outcome => {
      const found = [...(results?.outcomes || []),...(window.dataexVisual?.outcomes()||[])].filter(o => normalize(o.outcome) === normalize(outcome));
      let code = 'NOT_FOUND';
      if (found.length) {
        if (found.every(o => readyStates.includes(o.status))) code = 'FOUND_READY';
        else if (found.some(o => readyStates.includes(o.status) || ['CANDIDATE_ONLY','NEEDS_REVIEW','NEEDS_VISUAL_REVIEW'].includes(o.status))) code = 'FOUND_CANDIDATE';
        else code = found[0].status;
      }
      return { outcome, code };
    });
  }

  const fail = text => { throw new Error(text); };
  function validate(value, spec, path = 'results') {
    if(spec.anyOf){for(const branch of spec.anyOf){try{validate(value,branch,path);return;}catch(_){}}fail(path+': 対応する形式ではありません。');}
    const types = Array.isArray(spec.type) ? spec.type : [spec.type];
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(type) && !(type === 'number' && Number.isInteger(value) && types.includes('integer'))) fail(`${path}: 型が不正です。`);
    if (value === null) return;
    if (type === 'number' && (!Number.isFinite(value) || (spec.minimum !== undefined && value < spec.minimum) || (spec.maximum !== undefined && value > spec.maximum))) fail(`${path}: 数値が範囲外です。`);
    if (spec.enum && !spec.enum.includes(value)) fail(`${path}: 状態が不正です。`);
    if (type === 'string' && value.length > spec.maxLength) fail(`${path}: 文字数が上限を超えています。`);
    if (type === 'array') {
      if (value.length < (spec.minItems || 0) || value.length > spec.maxItems) fail(`${path}: 件数が範囲外です。`);
      value.forEach((item, i) => validate(item, spec.items, `${path}[${i}]`));
    }
    if (type === 'object') {
      for (const key of spec.required || []) if (!Object.hasOwn(value, key)) fail(`${path}.${key}: 必須です。`);
      for (const [key, item] of Object.entries(value)) {
        if (!Object.hasOwn(spec.properties, key)) fail(`${path}.${key}: 未対応の項目です。`);
        validate(item, spec.properties[key], `${path}.${key}`);
      }
    }
  }
  function metadata(data) {
    const lines = data.textContent.items.map(x => x.str?.trim()).filter(Boolean);
    const headings = lines.filter(x => /^(abstract|introduction|background|methods|results|discussion|conclusions?|limitations|references|statistical analysis|study protocol)$/i.test(x)).slice(0, 4);
    const captions = lines.filter(x => /^(table|figure|fig\.)\s*\d+/i.test(x)).slice(0, 3).map(x => x.slice(0, 60));
    return { headings, tableCaptions: captions.filter(x => /^table/i.test(x)), figureCaptions: captions.filter(x => /^(figure|fig\.)/i.test(x)) };
  }
  async function documentMap({ keywords = [], maxPages = 8 } = {}, options = {}) {
    checkReady();
    validate(keywords, list(str(100), 10), 'keywords');
    validate(maxPages, { type: 'integer', minimum: 1, maximum: 8 }, 'maxPages');
    const generation = state.generation, count = state.pdf.numPages, rows = [];
    let section = '';
    const terms = [...keywords, ...getState().outcomes].flatMap(x => x.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter(x => !['with', 'from', 'study', 'reported'].includes(x)).slice(0, 40);
    for (let page = 1; page <= count; page++) {
      options.signal?.throwIfAborted();
      const data = await pageData(page); checkGeneration(generation);
      const meta = metadata(data), text = data.raw.replace(/\s+/g, ' ').trim();
      // Conservative coverage guard for short articles with recognizable numbered sections.
      // Semantic relevance still belongs to the extractor; the map is not proof of absence.
      const headings = [...text.matchAll(/(?:^|\s)\d+\.\s*(Methods|Results|Discussion|References)\b/gi)].map(m=>m[1].toLowerCase());
      if(count<=8 && (/methods|results/.test(section)||headings.some(h=>/methods|results/.test(h))||meta.tableCaptions.length)) searchTrace().relevantPages.add(page);
      if(headings.length) section=headings[headings.length-1];
      const score = terms.reduce((n, t) => n + Number(text.toLowerCase().includes(t)), 0) + Number(meta.headings.includes('RESULTS'));
      const row = { page, ...meta, firstUsefulSentence: text.slice(0, 110), charCount: data.raw.length };
      while (JSON.stringify(row).length >= 490) {
        if (row.firstUsefulSentence.length) row.firstUsefulSentence = row.firstUsefulSentence.slice(0, -20);
        else if (row.figureCaptions.length) row.figureCaptions.pop();
        else if (row.tableCaptions.length) row.tableCaptions.pop();
        else row.headings.pop();
      }
      rows.push({ ...row, score });
    }
    const limit = count <= 8 ? count : maxPages;
    const selected = count <= 8 ? rows : [...rows].sort((a, b) => Number(b.page === 1 || b.page === count) - Number(a.page === 1 || a.page === count) || b.score - a.score || a.page - b.page).slice(0, limit).sort((a, b) => a.page - b.page);
    searchTrace().map=true;
    return { pageCount: count, returnedPages: selected.length, omittedPages: count - selected.length, selection: 'first/last and keyword relevance; heuristic, not proof of absence', pages: selected.map(({ score, ...row }) => row) };
  }
  async function pageText({ page, maxChars = 8000 } = {}, options = {}) {
    pageNumber(page); validate(maxChars, { type: 'integer', minimum: 1, maximum: 16000 }, 'maxChars');
    const generation = state.generation, data = await pageData(page);
    checkGeneration(generation); options.signal?.throwIfAborted(); readPages.add(page);
    const normalizedText = data.raw.normalize('NFKC').replace(/[\t ]+/g, ' ').trim();
    if(normalizedText.length<=maxChars) searchTrace().pages.add(page);
    const spans = data.spans.filter(s => data.raw.slice(s.start, s.end).trim()).slice(0, 12).map(s => ({ id: s.id, text: data.raw.slice(s.start, Math.min(s.end, s.start + 100)) }));
    return { page, normalizedText: normalizedText.slice(0, maxChars), ...metadata(data), spans, spansTruncated: data.spans.length > spans.length, truncated: normalizedText.length > maxChars, totalChars: normalizedText.length, textLayerOnly: true };
  }
  function brief() {
    checkReady();
    const raw = getState();
    const current = window.dataexReviewProfile?.brief(raw) || raw;
    // Return the activation decision even before outcomes are entered.
    const { filename, pageCount, intervention, comparator, outcomes, timepoint, populationRule, extraRules } = current;
    return { derivationProtocol:'SE_TO_SD: inputsはname/value/sourceRef。単一群はarm/output/linkage、複数群はcalculations[{arm,inputs,output,linkage}]を指定。全sourceにsourceId、source_type、contextを付ける。contextはstudy/arms/measure/timepoint/population/scope/seriesId/statistic/nBasis。linkageはstudy/arm/outcome/measure/timepoint/population/meanSourceRef/populationSourceRefs/seriesSourceRefs/rationale。同じ研究・群・測定系列・時点・集団の観測値と対応nの根拠を独立に照合。SERIESのnには系列適用と集団の補足根拠が必要。図注の直接報告はFIGURE_CAPTION。図からの目測は禁止。未解決なら導出せず要確認。', summaryProtocol, compositeProtocol:'compositeAuditの参考範囲は解析投入不可。2 componentsのstudy/analysisUnit=participant/population/timeWindow/群別Nを明示し、SOURCE_VERIFIED_TEXTのsourceRefsと定義のsemanticSourceRefs・semanticReasonを付ける。重複だけUNKNOWNで意味一致が確認できた場合のみrangeAllowed=true。範囲はDataExが再計算する。withdrawalとpermanent discontinuationの意味差を推測で解決しない。', profileConflict:current.profileConflict||{hasConflict:false,resolved:true,items:[]}, profileDecisionForPdf:current.profileDecisionForPdf||'SUPPRESS', extractionBlocked:!current.outcomes.length||current.profileDecisionForPdf==='UNDECIDED'||(!!current.profileConflict?.hasConflict&&!current.profileConflict?.resolved), profileSuppressed:!!current.profileSuppressed, profileConflictInstruction:'profileDecisionForPdf=UNDECIDEDの場合は抽出を開始せず、DataExの確認バナーで選択を促す。USEの場合のみProfileを使用する。profileConflict.resolved=falseの場合は抽出を開始せず、DataExの抽出ボタンからユーザーにレビュー設定の選択を促す。', activeReviewProfile:current.activeReviewProfile||null, profileRulesApplied:current.profileRulesApplied||null, filename, pageCount, intervention, comparator, outcomes, timepoint, populationRule, extraRules, unspecifiedFields: ['intervention','comparator','timepoint'].filter(key => !current[key].trim()), unspecifiedRule: '空欄は未指定であり、制限なしとは同義ではない。論文から候補を探索し、採用した群と時点を明示する。', conciseProtocol: protocol, requestedOutputSchemaSummary: 'study, summaryStatus, outcomes[{outcome,timepoint,population,analysisUnit,variableType,compatibility,requestedValue,relatedEvidence[{label,valueText,page,section,evidenceText,focusQuery}],reason,analysisAction,searchAudit{searchComplete,queries,pagesChecked,sectionsChecked,relatedTermsFound,notes},status,arms[{name,valueText,numerator,denominator,mean,sd,se}],effect,derivation,sources[{use,page,printedPage,section,tableFigure,row,column,evidenceText,focusQuery,verification}],note,reviewFlags}],unresolved. 数値不明はnull。未発見はNOT_FOUND、画像確認待ちはNEEDS_VISUAL_REVIEW。', workflow, sourceHierarchy: hierarchy };
  }
  // Each calculation owns its input references; source location is not a linkage rule.
  function calculations(d, o) {
    if(!d)return [];
    if(d.calculations?.length)return d.calculations;
    return d.output ? [{arm:d.arm || (o.arms.length===1?o.arms[0].name:''),inputs:d.inputs,output:d.output,linkage:d.linkage}] : [];
  }
  function ensureSourceIds(payload) {
    const used=new Set();
    for(const [i,o]of payload.outcomes.entries())for(const [j,s]of o.sources.entries()) {
      if(!s.sourceId)s.sourceId=`legacy-${i+1}-${j+1}`;
      if(used.has(s.sourceId))fail('sourceIdが重複しています：'+s.sourceId);
      used.add(s.sourceId);
    }
  }
  function validateDerivation(o,payload,verified,liveSearch) {
    const d=o.derivation,cs=calculations(d,o),profile=window.dataexReviewProfile?.active();
    const hasDerivedSD=o.arms.some(a=>a.sd!==null)&&(d!==null||o.sources.some(s=>s.use==='sd'&&s.verification==='DERIVED'));
    if(!cs.length) {
      if(liveSearch && (o.status==='READY_DERIVED'||hasDerivedSD))fail('派生値の登録には構造化inputs、output、linkageを指定してください。未解決ならSDを空欄にして要確認を維持してください。');
      if(liveSearch&&profile&&readyStates.includes(o.status)&&o.variableType==='continuous'&&o.arms.some(a=>a.se!==null&&!(a.denominator>0)))fail('対応n未解決のmean ± SEはCANDIDATE_ONLYまたはNEEDS_REVIEWを維持してください。');
      return;
    }
    if(d.label!=='SE_TO_SD')fail('未対応のderivation labelです。現在はSE_TO_SDのみ対応しています。');
    if(!/^SD=SE(?:\*|×)sqrt\(n\)$/i.test(d.formula.replace(/\s/g,'')))fail('SE_TO_SDのformulaはSD = SE * sqrt(n)です。');
    if(liveSearch && !profile?.allowSEtoSD)fail('レビュー設定でSE→SDを許可してください。');
    const byId=new Map(o.sources.map((s,i)=>[s.sourceId,{s,ok:verified[i]}]));
    const get=ref=>{const item=byId.get(ref);if(!item?.ok||item.s.verification!=='SOURCE_VERIFIED_TEXT')fail('検証済みsourceRefが必要です：'+ref);if(item.s.source_type==='FIGURE_DERIVED')fail('図形から推定した値はこの段階では使用できません。');return item.s;};
    const eq=(a,b)=>typeof a==='string'&&a.trim()&&normalize(a)===normalize(b||'');
    const containsNumber=(text,value)=>(text.normalize('NFKC').match(/\d+(?:\.\d+)?/g)||[]).some(x=>Number(x)===value);
    const seen=new Set();
    for(const c of cs) {
      const arm=o.arms.find(a=>a.name===c.arm),link=c.linkage;
      if(!arm||seen.has(c.arm))fail('導出のarmが不明または重複しています。');seen.add(c.arm);
      if(!link||!eq(link.study,payload.study)||!eq(link.arm,c.arm)||!eq(link.outcome,o.outcome)||!eq(link.timepoint,o.timepoint)||!eq(link.population,o.population)||!link.rationale.trim())fail('study / arm / outcome / timepoint / populationの対応と説明が必要です。');
      if(!Array.isArray(c.inputs)||c.inputs.length!==2||c.inputs.some(x=>typeof x!=='object'))fail('SE_TO_SDにはSEとnの構造化入力が必要です。');
      const se=c.inputs.find(x=>x.name==='SE'),n=c.inputs.find(x=>x.name==='n');
      if(!se||!n||!(se.value>0)||!Number.isInteger(n.value)||n.value<=0)fail('SE > 0、nは正の整数が必要です。');
      const seSource=get(se.sourceRef),nSource=get(n.sourceRef),meanSource=get(link.meanSourceRef);
      if(seSource.use!=='se'||!['n','denominator'].includes(nSource.use)||meanSource.use!=='mean')fail('入力とsourceの用途が一致しません。');
      if(!containsNumber(seSource.evidenceText,se.value)||!containsNumber(nSource.evidenceText,n.value)||!containsNumber(meanSource.evidenceText,arm.mean))fail('入力値をsourceの引用内で確認できません。');
      const context=(s,allowSeries=false)=>{const x=s.context;if(!x||!eq(x.study,link.study)||!x.arms.includes(c.arm)||!eq(x.measure,link.measure)||!eq(x.population,link.population)||x.statistic!=='OBSERVED')fail('sourceのstudy・群・測定系列・解析集団・観測値の対応が未解決です。');if(x.scope==='TARGET_TIMEPOINT'){if(!eq(x.timepoint,link.timepoint))fail('sourceの時点が異なります。');}else if(!allowSeries||x.scope!=='SERIES'||!x.seriesId)fail('sourceの時点範囲が不明です。');return x;};
      const mc=context(meanSource),sc=context(seSource),nc=context(nSource,true);
      if(nc.nBasis!=='OUTCOME_OBSERVED')fail('無作為化・baseline・完了者の人数は無条件に流用できません。');
      if(!link.populationSourceRefs.length)fail('対応する解析集団の根拠が必要です。');
      for(const ref of link.populationSourceRefs)context(get(ref),true);
      if(nc.scope==='SERIES') {
        if(!eq(mc.seriesId,nc.seriesId)||!eq(sc.seriesId,nc.seriesId)||!link.seriesSourceRefs.length)fail('nが同じ測定系列全体へ適用される根拠が必要です。');
        for(const ref of link.seriesSourceRefs){const x=context(get(ref),true);if(!eq(x.seriesId,nc.seriesId))fail('測定系列の対応が一致しません。');}
      }
      if(arm.se!==se.value||arm.denominator!==n.value)fail('群別SE/nと導出入力が一致しません。');
      const sd=se.value*Math.sqrt(n.value),out=c.output;
      if(out.name!=='SD'||!(out.value>0)||Math.abs(out.value-sd)>0.005000001||!(arm.sd>0)||Math.abs(arm.sd-sd)>0.005000001)fail('SD出力が再計算と一致しません（表示丸めは小数2桁まで）。');
      // Preserve full precision in storage, while the result card rounds only its display.
      out.value=sd;arm.sd=sd;
    }
    if(o.status==='READY_DERIVED'&&o.arms.some(a=>!seen.has(a.name)))fail('READY_DERIVEDには各群の導出入力が必要です。');
  }

  function validateComposite(outcome,payload,verified) {
    const audit=outcome.compositeAudit;if(!audit)return;
    // A reference union interval can never become a reported/derived point estimate.
    if(outcome.analysisAction==='USE'||readyStates.includes(outcome.status))fail('composite参考範囲をREADY/USEにできません。');
    if(outcome.arms.some(a=>a.numerator!==null||a.mean!==null||a.sd!==null||a.se!==null||a.valueText.trim())||outcome.effect||outcome.derivation)fail('composite候補・範囲は解析投入値と分離してください。armsの値・effect・derivationへコピーできません。');
    const sources=new Map(outcome.sources.map((s,i)=>[s.sourceId,{source:s,verified:verified[i]}]));
    const sourceFor=ref=>{const item=sources.get(ref);if(!item||!item.verified||item.source.verification!=='SOURCE_VERIFIED_TEXT')fail('composite componentのsourceRefsは照合済みの根拠が必要です。');return item.source;};
    let semanticBlocked=false;
    for(const component of audit.components) {
      component.sourceRefs.forEach(sourceFor);
      if(component.countsByArm.some(c=>c.events>c.denominator))fail('composite componentのeventsがNを超えています。');
      if(new Set(component.countsByArm.map(c=>normalize(c.arm))).size!==component.countsByArm.length)fail('composite componentの群名が重複しています。');
      if(['AMBIGUOUS','RELATED_ONLY'].includes(component.semanticCompatibility))semanticBlocked=true;
      // Withdrawal is not automatically equivalent to permanent discontinuation.
      if(/withdrawal|interruption|一時中断/i.test(component.name)&&/discontinu|投与中止|永続的中止/i.test(outcome.requestedValue+' '+outcome.outcome)) {
        const definitions=(component.semanticSourceRefs||[]).map(sourceFor).map(s=>s.evidenceText).join(' ');
        if(!/permanent(?:ly)?\s+(?:discontinu|withdraw)|永続的.*中止|永久.*中止/i.test(definitions)||/temporary\s+interruption|一時中断/i.test(definitions)) {
          semanticBlocked=true;component.semanticCompatibility='AMBIGUOUS';
          audit.reason='withdrawal/interruptionが恒久的な投与中止のみを指すか原著定義から確定できません。一時中断を含む可能性があり、requested discontinuationとの意味差が未解決です。';
        }
      }
    }
    if(semanticBlocked){audit.rangeAllowed=false;audit.ranges=[];if(!audit.reason.trim())audit.reason='componentの意味が完全一致するか未確定です。';return;}
    if(!audit.rangeAllowed){audit.ranges=[];return;}
    if(audit.components.length!==2||audit.overlapStatus!=='UNKNOWN')fail('参考union範囲は2 componentの重複だけがUNKNOWNの場合に限ります。');
    const same=(a,b)=>typeof a==='string'&&!!a.trim()&&normalize(a)===normalize(b||'');
    const first=audit.components[0],ranges=[];
    for(const component of audit.components) {
      if(component.analysisUnit!=='participant'||outcome.analysisUnit!=='participant')fail('union範囲にはparticipant-level countが必要です。');
      if(!same(component.study,payload.study)||!same(component.population,outcome.population)||!same(component.timeWindow,outcome.timepoint))fail('compositeのstudy / analysis population / time windowが一致しません。');
      if(!component.semanticReason?.trim()||!component.semanticSourceRefs?.length)fail('componentの意味適合理由と原著定義のsemanticSourceRefsが必要です。');
      for(const ref of component.semanticSourceRefs)if(sourceFor(ref).use!=='definition')fail('semanticSourceRefsには定義の根拠を指定してください。');
      if(component.countsByArm.length!==first.countsByArm.length)fail('componentの群が一致しません。');
      for(const count of component.countsByArm) {
        const match=first.countsByArm.find(c=>same(c.arm,count.arm));
        if(!match||match.denominator!==count.denominator)fail('componentのarm / denominatorが一致しません。');
        const refs=component.sourceRefs.map(sourceFor).filter(s=>s.context&&same(s.context.study,component.study)&&s.context.arms.some(a=>same(a,count.arm))&&same(s.context.population,component.population)&&same(s.context.timepoint,component.timeWindow)&&s.context.statistic==='OBSERVED');
        const contains=(s,n)=>(s.evidenceText.match(/\d+(?:\.\d+)?/g)||[]).some(v=>Number(v)===n);
        if(!refs.some(s=>s.use==='numerator'&&contains(s,count.events))||!refs.some(s=>['denominator','n'].includes(s.use)&&contains(s,count.denominator)))fail('各componentの人数とNに、研究・群・集団・時点が一致する照合済みsourceが必要です。');
      }
    }
    for(const a of first.countsByArm) {const b=audit.components[1].countsByArm.find(c=>same(c.arm,a.arm));ranges.push({arm:a.arm,lower:Math.max(a.events,b.events),upper:Math.min(a.denominator,a.events+b.events),denominator:a.denominator});}
    // Ignore supplied arithmetic: only these recomputed bounds are displayed/stored.
    audit.ranges=ranges;
  }

  async function audit(payload, liveSearch = true) {
    checkReady(); validate(payload, resultSchema); ensureSourceIds(payload);
    const generation = state.generation, checks = [], warnings = [];
    for (const [i, outcome] of payload.outcomes.entries()) {
      resolveOutcome(outcome, liveSearch);
      if(outcome.status==='NOT_DERIVABLE'&&!outcome.relatedEvidence.length&&!outcome.compositeAudit) warnings.push(outcome.outcome+': 関連データの根拠を登録してください。');
      for(const source of outcome.relatedEvidence) {
        pageNumber(source.page); const data=await pageData(source.page);checkGeneration(generation);
        const evidence=normalize(source.evidenceText),query=normalize(source.focusQuery);
        if(!evidence||!query||!data.normalized.includes(evidence)||!evidence.includes(query)) fail(outcome.outcome+': 関連データの根拠をPDFで照合できません。');
      }
      const ready = readyStates.includes(outcome.status);
      if (!outcome.outcome.trim()) fail('Outcome名が空です。');
      if (ready && !outcome.sources.length) fail(`${outcome.outcome}: READYには根拠sourceが必要です。`);
      if (outcome.status === 'READY_DERIVED' && (!outcome.derivation?.formula?.trim() || !outcome.derivation.inputs.length&&!outcome.derivation.calculations?.length)) fail('READY_DERIVEDには導出過程が必要です。');
      if (outcome.status === 'READY_WITH_ASSUMPTION' && !outcome.derivation?.assumption?.trim()) fail('READY_WITH_ASSUMPTIONには仮定を明記してください。');
      for (const arm of outcome.arms) {
        for (const key of ['numerator', 'denominator', 'sd', 'se']) if (arm[key] !== null && arm[key] < 0) fail(`${outcome.outcome}: ${key}は負にできません。`);
        if (outcome.variableType === 'binary' && arm.numerator !== null && arm.denominator !== null && arm.numerator > arm.denominator) fail(`${outcome.outcome}: numerator > denominatorです。`);
        if (ready && outcome.variableType === 'binary' && (arm.numerator === null || arm.denominator === null || arm.denominator === 0)) fail(`${outcome.outcome}: READYには対応する分子と正の分母が必要です。`);
      }
      if (ready && outcome.variableType === 'continuous' && outcome.arms.some(a=>a.mean===null)) fail('READYの連続値には平均が必要です。');
      if (ready && outcome.variableType !== 'effect' && !outcome.arms.length) fail('READYにはarmの値が必要です。');
      if (ready && outcome.variableType === 'effect' && outcome.effect?.estimate == null) fail('READYには効果量が必要です。');
      if (outcome.effect?.se !== null && outcome.effect?.se < 0) fail('effect.seは負にできません。');
      if (outcome.effect?.ciLow != null && outcome.effect?.ciHigh != null && outcome.effect.ciLow > outcome.effect.ciHigh) fail('信頼区間の上下限が逆です。');
      const verified = [];
      for (const source of outcome.sources) {
        if(source.source_type==='FIGURE_DERIVED')fail('図形からの推定値はPhase 3まで使用できません。');
        pageNumber(source.page);
        const data = await pageData(source.page); checkGeneration(generation);
        const evidence = normalize(source.evidenceText), query = normalize(source.focusQuery);
        const exists = !!evidence && !!query && data.normalized.includes(evidence) && evidence.includes(query);
        if (source.verification === 'SOURCE_VERIFIED_TEXT' && !exists) fail(`${outcome.outcome}: PDF p.${source.page}の根拠テキストとfocusQueryを照合できません。`);
        if (ready && !exists) fail(`${outcome.outcome}: READYの全sourceに実在する根拠を指定してください。`);
        verified.push(exists && source.verification !== 'UNRESOLVED');
      }
      if (ready && verified.some(v => !v)) fail(`${outcome.outcome}: 未解決sourceを含むREADYは登録できません。`);
      if (ready && outcome.sources.every(s => /abstract/i.test(s.section || ''))) warnings.push(`${outcome.outcome}: Abstractのみです。詳細Results/Tableを再確認してください。`);

      validateComposite(outcome,payload,verified);
      validateDerivation(outcome,payload,verified,liveSearch);
      checks[i] = verified;
    }
    const count = payload.outcomes.filter(o => readyStates.includes(o.status)).length;
    if (payload.summaryStatus === 'READY' && (count !== payload.outcomes.length || payload.unresolved.length)) fail('summaryStatus READYと未解決項目が矛盾しています。');
    return { checks, warnings };
  }
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  function button(text, action) { const node = el('button', text); node.type = 'button'; node.addEventListener('click', action); return node; }
  const labels = { READY: '解析投入可', READY_DERIVED: '解析投入可（派生値）', READY_WITH_ASSUMPTION: '条件付きで解析投入可', CANDIDATE_ONLY: '候補・要確認', NEEDS_REVIEW: '要確認', NOT_REPORTED: '報告なし', NOT_FOUND: '未発見・追加探索', NOT_DERIVABLE: '算出不可', NEEDS_VISUAL_REVIEW: '画像確認待ち' };
  const reviewLabels = { NOT_REVIEWED: '未確認', ACCEPTED: '承認済み', CORRECTED: '修正済み', REVIEW_REQUIRED: '要確認', REJECTED: '却下' };
  const useLabels = { numerator: 'イベント数', denominator: '分母', n:'解析人数', mean: '平均値', sd: '標準偏差', se: '標準誤差', effect: '効果量', timepoint: '時点', population: '解析集団', definition: 'アウトカム定義', other: 'その他' };
  function evidenceButton(text, action, hasSource = true) {
    const node = button(text, action); node.disabled = !pdfMatches || !hasSource;
    if (!pdfMatches) node.title = '原著PDFを再選択すると根拠を表示できます';
    return node;
  }
  function render() {
    focusSerial++; $('evidence-navigation').replaceChildren();
    const allOutcomes=[...(results?.outcomes||[]),...(window.dataexVisual?.outcomes()||[])],hasResults=allOutcomes.length>0;
    const root = $('result-cards'); root.replaceChildren(); $('results-empty').hidden = hasResults;
    $('review-header').hidden = !hasResults; $('restore-notice').hidden = !hasResults || pdfMatches;
    if (!hasResults) { confirmedSummary=null; return; }
    const complete=completeness();
    confirmedSummary=summarize(allOutcomes);
    const counts=confirmedSummary.summaryCounts;
    const countText=`解析投入可 ${counts.use} ｜ 要確認 ${counts.review} ｜ 解析投入しない ${counts.doNotUse}`;
    const filename = documentMeta?.filename || state.filename || '';
    const filenameLabel = el('span', filename, 'review-filename'); filenameLabel.title = filename;
    $('review-summary').replaceChildren(filenameLabel, el('span', ` ｜ ${counts.total} outcomes ｜ ${countText}`, 'review-counts'));
    const summary = el('div', null, 'result-summary');
    summary.append(el('strong', results?.study||'選択範囲からの視覚抽出'), el('p', countText)); root.append(summary);
    // Requested order is primary. Without it, apply stable status grouping to extra outcomes.
    const rank = status => status === 'READY' ? 0 : readyStates.includes(status) ? 1 : ['CANDIDATE_ONLY','NEEDS_REVIEW','NEEDS_VISUAL_REVIEW'].includes(status) ? 2 : 3;
    const ordered = (results?.outcomes||[]).map((outcome, i) => ({ outcome, i, requested: requestOrder.findIndex(x => normalize(x) === normalize(outcome.outcome)) }));
    ordered.sort((a,b) => {
      if (a.requested >= 0 || b.requested >= 0) return (a.requested < 0 ? Infinity : a.requested) - (b.requested < 0 ? Infinity : b.requested) || a.i-b.i;
      if (normalize(a.outcome.outcome) === normalize(b.outcome.outcome)) return a.i-b.i;
      return rank(a.outcome.status)-rank(b.outcome.status) || a.i-b.i;
    });
    ordered.forEach(({outcome, i}) => {
      const card = el('article', null, 'result-card'); card.dataset.outcomeIndex = i;
      const review = reviews.get(i) || { state: 'NOT_REVIEWED' };
      const info = el('p', [outcome.timepoint, outcome.population].filter(Boolean).join(' ｜ '), 'outcome-meta'); info.title = info.textContent;
      card.append(el('h3', outcome.outcome), info, el('span', labels[outcome.status], `result-status status-${outcome.status}`));
      card.append(el('span',compatibilityLabels[outcome.compatibility],'compatibility-label'));
      const statusCard=el('div',null,'analysis-status-card');
      statusCard.append(el('p','指定値：'+outcome.requestedValue));
      if(outcome.reason) statusCard.append(el('p',outcome.reason,'status-reason'));
      statusCard.append(el('strong','解析への扱い：'+({USE:'解析投入可',DO_NOT_USE:'解析投入しない',REVIEW:'要確認'})[outcome.analysisAction],'analysis-action'));
      card.append(statusCard);
      if(outcome.compositeAudit) {
        const audit=outcome.compositeAudit,section=el('section',null,'composite-audit');
        section.append(el('h4',audit.rangeAllowed?'参考範囲（解析投入不可）':'component候補'),el('p',audit.reason));
        if(audit.rangeAllowed) {
          for(const range of audit.ranges)section.append(el('p',range.arm+': '+range.lower+'–'+range.upper+' / '+range.denominator,'composite-range'));
          section.append(el('p','※この範囲はmeta-analysisへ投入しません。','hint'));
        } else section.append(el('p','union範囲は表示しません。','hint'));
        for(const component of audit.components) {
          section.append(el('p',component.name+': '+component.countsByArm.map(c=>c.arm+' '+c.events+' / '+c.denominator).join(' ｜ ')));
          const additional=el('details'),seen=new Set();additional.append(el('summary','補足根拠'));let displayed=0;
          for(const ref of [...new Set([...component.sourceRefs,...(component.semanticSourceRefs||[])])]) {
            const source=outcome.sources.find(s=>s.sourceId===ref);
            if(source&&!seen.has(source.page+':'+source.focusQuery)) {
              seen.add(source.page+':'+source.focusQuery);
              const target=displayed++?additional:section;
              target.append(evidenceButton(component.name+'の原著を見る（'+useLabels[source.use]+'・p.'+source.page+'）',()=>focusEvidenceAnchor(source)));
            }
          }
          if(displayed>1)section.append(additional);
        }
        card.append(section);
      }
      if(outcome.relatedEvidence.length) {
        const related=el('section',null,'related-evidence');related.append(el('h4','原著で確認できた関連データ'));
        for(const r of outcome.relatedEvidence) {
          const item=el('div',null,'related-item');item.append(el('strong',r.label));if(r.valueText)item.append(el('p',r.valueText));
          const verification=el('p',positionText(r,pdfMatches?'関連テキスト照合済み':'関連テキスト照合済み（保存時）'),'verification');verification.dataset.focusKey=focusKey(r);
          const showRelated=async()=>{await focusEvidenceAnchor(r);verification.textContent=positionText(r,'根拠位置未照合');};
          const open=evidenceButton('関連する原著を見る',showRelated);item.append(open,verification);
          item.addEventListener('click',event=>{if(event.target?.closest?.('button')||!pdfMatches)return;showRelated();});related.append(item);
        }
        card.append(related);
      }
      if(['NOT_FOUND','NOT_REPORTED','NOT_DERIVABLE'].includes(outcome.status)) {
        const a=outcome.searchAudit,details=el('details',null,'search-audit');details.append(el('summary','探索内容を見る'),el('p',a.searchComplete?'探索完了（記録された範囲）':'探索未完了'),el('p','検索語：'+a.queries.join(' / ')),el('p','確認ページ：'+a.pagesChecked.join(', ')),el('p','確認箇所：'+a.sectionsChecked.join(' / ')),el('p','関連表現：'+(a.relatedTermsFound||[]).join(' / ')),el('p',a.notes||''));card.append(details);
      }
      const technical = el('details', null, 'technical-result'); technical.append(el('summary','状態の詳細'),el('p',`${outcome.status} / ${outcome.compatibility} / ${outcome.analysisAction} / ${outcome.analysisUnit || '解析単位未指定'}`));
      let activeSource = Math.min(selectedSources.get(i) || 0, Math.max(0,outcome.sources.length-1));
      const sourceLine = el('div', null, 'source-line'), evidenceState = el('p', null, 'verification');
      const sourceDetails = el('details', null, 'source-details'); sourceDetails.append(el('summary','根拠詳細')); const sourceBody = el('div'); sourceDetails.append(sourceBody);
      function moveSource(delta) { activeSource = (activeSource + outcome.sources.length + delta) % outcome.sources.length; selectedSources.set(i,activeSource); updateSource(); showEvidence(); }
      function updateSource() {
        sourceLine.replaceChildren(); sourceBody.replaceChildren();
        const source = outcome.sources[activeSource];
        evidenceState.textContent = sourceChecks[i]?.[activeSource] ? `✓ 原著照合済み${pdfMatches ? '' : '（保存時）'}` : source?.verification === 'UNRESOLVED' ? '未解決' : '未検証';
        if(source){evidenceState.dataset.focusKey=focusKey(source);evidenceState.textContent=positionText(source,evidenceState.textContent);}
        if (outcome.derivation) evidenceState.textContent += ' ｜ 派生値';
        if (!source) { sourceLine.append(el('span','根拠未登録')); return; }
        sourceLine.append(evidenceButton(`根拠 ${activeSource+1}/${outcome.sources.length} ｜ PDF p.${source.page}${source.section ? ' ｜ '+source.section : ''}`, () => showEvidence()), el('span',useLabels[source.use],'source-use'));
        if (outcome.sources.length>1) sourceLine.append(evidenceButton('‹ 前の根拠',()=>moveSource(-1)),evidenceButton('次の根拠 ›',()=>moveSource(1)));
        sourceBody.append(el('p',`用途：${useLabels[source.use]}${source.column ? ' ｜ '+source.column : ''}`));
        if (source.tableFigure || source.row || source.printedPage) sourceBody.append(el('p',[source.tableFigure,source.row,source.printedPage ? '原著ページ '+source.printedPage : null].filter(Boolean).join(' ｜ ')));
        sourceBody.append(el('blockquote',source.evidenceText));
      }
      async function showEvidence(use,armName) {
        if (!pdfMatches) return;
        if (use) {
          let at=armName ? outcome.sources.findIndex(s=>s.use===use&&[s.column,s.row].some(x=>x&&normalize(x).includes(normalize(armName)))) : -1;
          if (at<0) at=outcome.sources.findIndex(s=>s.use===use);
          if (at>=0) activeSource=at; selectedSources.set(i,activeSource); updateSource();
        }
        const source=outcome.sources[activeSource]; if (!source) return;
        const serial=++focusSerial;
        try {
          const focused=await focusEvidenceAnchor(source);
          if (serial!==focusSerial) return;
          updateSource();if(!focused?.ok||!focused.highlightedCount)return;
          const nav=$('evidence-navigation'); nav.replaceChildren();
          nav.append(el('span',`${activeSource+1} / ${outcome.sources.length}`));
          if (outcome.sources.length>1) nav.append(evidenceButton('前へ',()=>moveSource(-1)),evidenceButton('次へ',()=>moveSource(1)));
        } catch(error) { if(serial===focusSerial) message('evidence-message',error.message,true); }
      }
      for (const arm of outcome.analysisAction==='DO_NOT_USE' ? [] : outcome.arms) {
        const row=el('div',null,'arm-row');if(calculations(outcome.derivation,outcome).length)row.style.flexWrap='wrap';
        const value=arm.numerator!==null&&arm.denominator!==null ? `${arm.numerator} / ${arm.denominator}` : arm.mean!==null ? `${arm.mean}${arm.sd!==null ? ' (SD '+(calculations(outcome.derivation,outcome).length?arm.sd.toFixed(2):arm.sd)+')' : ''}${arm.se!==null ? ' (SE '+arm.se+')' : ''}${arm.denominator!==null ? ' (n '+arm.denominator+')' : ''}` : arm.valueText;
        row.append(el('span',arm.name),evidenceButton(value||'—',()=>showEvidence(outcome.variableType==='binary'?'numerator':'mean',arm.name),!!outcome.sources.length)); card.append(row);if(calculations(outcome.derivation,outcome).length){row.lastChild.style.whiteSpace='normal';row.lastChild.style.maxWidth='100%';}
      }
      if(outcome.analysisAction!=='DO_NOT_USE' && outcome.effect) card.append(evidenceButton(`${outcome.effect.measure||'効果量'}: ${outcome.effect.estimate??'—'} [${outcome.effect.ciLow??'—'}, ${outcome.effect.ciHigh??'—'}]`,()=>showEvidence('effect'),!!outcome.sources.length));
      if(outcome.sources.length) {card.append(evidenceState,sourceLine,sourceDetails); updateSource();}

      if(outcome.note) card.append(el('p',outcome.note,'outcome-note'));
      if(outcome.reviewFlags.length) card.append(el('p',outcome.reviewFlags.join(' / '),'review-flags'));
      if(outcome.derivation) {
        const d=outcome.derivation,cs=calculations(d,outcome),details=el('details',null,'derivation-details');details.append(el('summary','導出・仮定'),el('p',d.label),el('p',d.formula));
        if(cs.length){card.append(el('p','派生：SD = SE × √n','derivation-formula'));
          for(const c of cs){details.append(el('strong',c.arm),el('p',c.inputs.map(x=>x.name+' = '+x.value+' ← '+x.sourceRef).join(' / ')),el('p','SD = '+c.output.value),el('p',c.linkage.rationale));
            const links=el('div',null,'source-line');links.append(el('span',c.arm));
            for(const [label,ref]of [['Mean/SEの原著を見る',c.linkage.meanSourceRef],['nの原著を見る',c.inputs.find(x=>x.name==='n').sourceRef]]){const index=outcome.sources.findIndex(x=>x.sourceId===ref),src=outcome.sources[index];links.append(evidenceButton(label,()=>{activeSource=index;selectedSources.set(i,index);updateSource();return showEvidence();},index>=0),el('span',src?'PDF p.'+src.page+' / '+(src.section||src.tableFigure||''):'根拠未解決'));}card.append(links);
          }
        }else details.append(el('p',d.inputs.map(x=>typeof x==='string'?x:x.name+' = '+x.value+' ← '+x.sourceRef).join('; ')));
        details.append(el('p',d.assumption||''));card.append(details);
      }
      const actions=el('div',null,'review-actions');
      function mark(state) {reviews.set(i,{...review,state});persist();render();}
      const editButton=button('修正',()=>{editor.hidden=!editor.hidden;});editButton.disabled=!pdfMatches;editButton.title=pdfMatches?'':'原著PDFを再選択すると値を修正できます';
      actions.append(evidenceButton('原著を見る',()=>showEvidence(),!!outcome.sources.length),button('承認',()=>mark('ACCEPTED')),editButton,button('要確認',()=>mark('REVIEW_REQUIRED')),button('却下',()=>mark('REJECTED')));
      const editor=el('div',null,'correction-editor');editor.hidden=true; const fields=[];
      for(const [armIndex,arm] of outcome.arms.entries()) {
        editor.append(el('strong',arm.name));
        for(const key of ['valueText','numerator','denominator','mean','sd','se']) {
          if(key!=='valueText'&&outcome.variableType==='binary'&&!['numerator','denominator'].includes(key))continue;
          const label=el('label',key==='valueText'?'表示値':useLabels[key]),input=el('input');input.type=key==='valueText'?'text':'number';input.step='any';input.value=arm[key]??'';
          label.append(input);editor.append(label);fields.push({armIndex,key,input});
        }
      }
      const label=el('label','修正理由'),field=el('textarea');field.maxLength=3000;field.value=review.correction||'';label.append(field);const editError=el('p','','error');
      editor.append(label,editError,button('修正を保存',async()=>{
        if(!field.value.trim())return field.focus();
        const generation=state.generation,original=results,next=structuredClone(results);
        fields.forEach(({armIndex,key,input})=>{next.outcomes[i].arms[armIndex][key]=key==='valueText'?input.value:input.value.trim()?Number(input.value):null;});
        if(calculations(next.outcomes[i].derivation,next.outcomes[i]).length)next.outcomes[i].derivation=null;
        next.outcomes[i].status='NEEDS_REVIEW';next.outcomes[i].compatibility='AMBIGUOUS';next.outcomes[i].analysisAction='REVIEW';next.outcomes[i].reason='手動修正値の採用確認：'+field.value.trim();next.summaryStatus='PARTIAL';
        try {await audit(next,false);checkGeneration(generation);if(results!==original)fail('結果が更新されました。修正をやり直してください。');reviews.set(i,{state:'CORRECTED',correction:field.value.trim(),original:review.original||structuredClone(outcome)});results=next;resultRevision++;persist();render();}
        catch(error){editError.textContent=error.message;}
      }));
      card.append(actions,editor,el('p',`確認状態：${reviewLabels[review.state]}`,'review-state'));
      if(review.correction)card.append(el('p',`修正記録（未検証）：${review.correction}`,'review-flags'));
      card.append(technical);root.append(card);
    });
    for(const missing of complete.filter(c=>c.code==='NOT_FOUND'&&!allOutcomes.some(o=>normalize(o.outcome)===normalize(c.outcome)))) {
      const card=el('article',null,'result-card');card.append(el('h3',missing.outcome),el('span','未発見・追加探索','result-status status-NOT_FOUND'),el('p','このアウトカムの結果はまだ返されていません。報告なしとは区別しています。'));root.append(card);
    }
    if(results?.unresolved.length){const section=el('section',null,'unresolved-list');section.append(el('h3','未解決事項'));results.unresolved.forEach(item=>section.append(el('p',`${item.outcome?item.outcome+': ':''}${item.issue} — ${item.impact}`)));root.append(section);}
    window.dataexVisual?.render(root,pdfMatches);
  }

  async function setResults(payload, options = {}) {
    const profileBrief=window.dataexReviewProfile?.brief(getState());
    if(profileBrief?.profileDecisionForPdf==='UNDECIDED')fail('レビュー設定をこのPDFに使うか、DataExの確認バナーで選択してください。');
    const conflict=profileBrief?.profileConflict;
    if(conflict?.hasConflict&&!conflict.resolved)fail('レビュー設定が今回の抽出条件と一致しません。DataExの抽出ボタンから設定を選択してください。');
    const generation = state.generation;
    // Keep the current UI intact on any validation failure or document change.
    if (JSON.stringify(payload).length > 200000) fail('結果が大きすぎます。必要な値と短い根拠に絞ってください。');
    const next = structuredClone(payload), audited = await audit(next);
    checkGeneration(generation); options.signal?.throwIfAborted();
    next.summaryStatus=next.outcomes.some(o=>o.analysisAction==='REVIEW')?'NEEDS_REVIEW':next.outcomes.every(o=>o.analysisAction==='USE')&&!next.unresolved.length?'READY':'PARTIAL';
    if (JSON.stringify(results) !== JSON.stringify(next)) reviews.clear();
    results = next; sourceChecks = audited.checks; requestOrder = getState().outcomes.slice(); resultRevision++;
    if (!storageKey && documentMeta) storageKey = keyFor(documentMeta);
    pdfMatches = true; selectedSources.clear(); render(); persist(); reviewMode();
    return { ...structuredClone(confirmedSummary), completeness: completeness(), displayed: confirmedSummary.summaryCounts.total, ready: confirmedSummary.summaryCounts.use, needsReview: confirmedSummary.summaryCounts.review, doNotUse: confirmedSummary.summaryCounts.doNotUse, warnings: audited.warnings, note: 'PDFの根拠テキスト一致を検証。数値の意味・対応関係の妥当性は抽出者と人の確認が必要。' };
  }
  function reset() { window.dataexVisual?.clear(); results = null; sourceChecks = []; reviews.clear(); readPages.clear(); selectedSources.clear(); render(); }
  $('request-text').textContent = '送信文：「このDataExを抽出してください…」';
  $('request-text').title = requestText;
  $('copy-request').textContent = 'もう一度コピー';
  $('toggle-conditions').addEventListener('click', () => {
    const content=$('condition-content');content.hidden=!content.hidden;
    $('toggle-conditions').textContent=content.hidden?'抽出条件を表示':'抽出条件を閉じる';
    $('toggle-conditions').setAttribute('aria-expanded',String(!content.hidden));
  });
  $('erase-results').addEventListener('click', eraseResult);
  $('reselect-pdf').addEventListener('click', () => $('pdf-file').click());
  $('conditions').addEventListener('input', persist);
  window.addEventListener('pagehide', persist);
  async function copyRequest() {
    if(window.dataexReviewProfile && !await window.dataexReviewProfile.confirmExtraction(getState()))return;
    $('request-guide').hidden=false;
    try { await navigator.clipboard.writeText(requestText); message('extract-message','① 抽出依頼をコピーしました\n② 左のWorkに貼り付けて送信してください'); }
    catch (_) { $('request-text').textContent='送信文：'+requestText; message('extract-message','自動コピーできませんでした。送信文を選択してコピーしてください。',true); }
  }
  const tools = [
    tool('dataex_get_extraction_brief', `抽出依頼の最初に条件と12項目の短い手順を取得する。profileDecisionForPdf=UNDECIDEDなら抽出を開始せず、DataExの確認バナーで選択を促す。USEのみProfile適用。${workflow} ${hierarchy}`, schema({}), brief, true),
    tool('dataex_get_document_map', 'PDF全文を返さず短いページmapを返す。8ページ以内は全ページ、長文は先頭/末尾とkeyword関連ページを優先。map未掲載・検索未発見はNOT_REPORTEDの証拠ではない。', schema({ keywords: list(str(100), 10), maxPages: { type: 'integer', minimum: 1, maximum: 8, default: 8 } }), documentMap, true),
    tool('dataex_get_page_text', '検索snippetだけでは不足する場合に必要な1ページだけ読む。maxChars上限16000。全文一括取得は禁止。ページ結果を再利用し、全ページを順に読む代替手段にしない。画像だけの表・図はNEEDS_VISUAL_REVIEW。', schema({ page: { type: 'integer', minimum: 1 }, maxChars: { type: 'integer', minimum: 1, maximum: 16000, default: 8000 } }, ['page']), pageText, true),
    tool('dataex_set_results', `抽出した構造化結果をDataEx左側に表示する。outcome名はユーザーの入力名を保持し、入力順で返す。${hierarchy} 根拠はsourceId、evidenceText、focusQueryを指定。SE_TO_SDは構造化inputs/sourceRef/output/linkageを使用し、群別計算はcalculationsに格納。別ページのsourceを許可するがstudy/arm/measure/timepoint/populationと観測系列の対応が必要。図注はFIGURE_CAPTIONであり図の目測値ではない。旧inputs文字列は読み込み互換。SOURCE_VERIFIED_TEXTは引用一致を表し、意味的正しさの自動保証ではない。NOT_FOUND/NOT_REPORTED/NOT_DERIVABLEとNEEDS_VISUAL_REVIEWを区別。${summaryProtocol} compositeAuditは参考情報であり解析値ではない。rangeAllowedにはstudy/analysisUnit/population/timeWindow/semanticReason/semanticSourceRefsを各componentに指定する。`, resultSchema, setResults, false)
  ];
  restoreLatest();
  return { getBrief:brief,getSummary:()=>structuredClone(confirmedSummary),visualChanged(collapse=true){requestOrder=getState().outcomes.slice();render();persist();if(collapse)reviewMode(false);}, recordSearch(query) { searchTrace().queries.add(normalize(query)); }, tools, reset, detachPdf, onPdfLoaded, requestText, copyRequest, async submit(save) {
    try {
      if (!state.pdf || state.loading) fail('PDFを選択してください');
      if(window.dataexReviewProfile && !await window.dataexReviewProfile.confirmExtraction(getState()))return;
      if (!getState().outcomes.length) fail('少なくとも1つのアウトカムを入力してください');
      save();
      if (!storageKey && documentMeta) storageKey=keyFor(documentMeta);
      persist(); await copyRequest();
    } catch(error) { message('extract-message',error.message,true); }
  } };
};
