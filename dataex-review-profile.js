/* Review-scoped preferences only. No PDF bytes, extraction or network requests. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), KEY = 'dataex:review-profiles:v1';
  const clone = x => JSON.parse(JSON.stringify(x));
  const resultTypes = ['any','final value','change from baseline','responder','binary event','model-based effect'];
  const timeLabels={'exact only':'完全一致のみ','closest':'指定範囲内で最も近い時点','earliest in window':'指定範囲内で最も早い時点','latest in window':'指定範囲内で最も遅い時点','study-reported relevant':'原著の代表時点'};
  const timeRules=Object.keys(timeLabels);
  function parseTime(text){const m=text.trim().match(/^(\d+(?:\.\d+)?)\s*(?:[-–—〜～]\s*(\d+(?:\.\d+)?))?\s*(days?|weeks?|months?|years?|日|週|週間|か月|ヶ月|月|年)$/i);return m&&Number(m[1])<=Number(m[2]||m[1])?{timeWindowLower:m[1],timeWindowUpper:m[2]||m[1],timeUnit:m[3]}:{timeWindowLower:'',timeWindowUpper:'',timeUnit:''};}
  const base = () => ({profileName:'',studyDesign:'',analysisUnit:'',synthesisNodeRule:'',outcomes:[],allowSEtoSD:false,allowCItoSE:false,requireExplicitMatchingNForSEtoSD:true,allowScaleConversion:false,preferRawArmValues:true,preferAdjustedEffect:false,denominatorPreference:'',eventUnit:'participant',allowStructuralZero:false,prohibitSpecificAESumToAnyAE:true,allowFigureDerived:false});
  const outcomeBase = () => ({reviewOutcomeName:'',clinicalConcept:'',preferredMeasures:[],allowedMeasures:[],resultType:'any',targetTime:'',timeSelectionRule:'exact only',timeWindowLower:'',timeWindowUpper:'',timeUnit:'weeks',preferredPopulation:'',allowedPopulations:[],notes:''});
  function validateProfile(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('設定の形式が正しくありません。');
    const p=base();
    const read=(obj,key,def)=>{
      let v=obj[key]===undefined?def:obj[key]; if(['timeWindowLower','timeWindowUpper','targetTime'].includes(key)&&typeof v==='number')v=String(v);
      if(typeof def==='boolean') {if(typeof v!=='boolean')throw Error(key+' はtrue/falseで指定してください。');return v;}
      if(Array.isArray(def)){if(!Array.isArray(v)||v.length>50||v.some(s=>typeof s!=='string'||s.length>500))throw Error(key+' のリストが長すぎるか不正です。');return v.map(s=>s.trim()).filter(Boolean);}
      if(typeof v!=='string'||v.length>2000)throw Error(key+' は2000文字以内で指定してください。');return v.trim();
    };
    for(const k of Object.keys(p))if(k!=='outcomes')p[k]=read(input,k,p[k]);
    if(!p.profileName)throw Error('レビュー名を入力してください。');
    if(p.requireExplicitMatchingNForSEtoSD!==true||p.prohibitSpecificAESumToAnyAE!==true||p.allowFigureDerived!==false)throw Error('対応n必須・AE合算禁止・図からの推定無効は変更できません。');
    if(p.preferRawArmValues===p.preferAdjustedEffect)throw Error('群別値と調整済み効果の優先指定はどちらか一つです。');
    if(!Array.isArray(input.outcomes)||!input.outcomes.length||input.outcomes.length>50)throw Error('アウトカムは1～50件にしてください。');
    p.outcomes=input.outcomes.map(o=>{
      if(!o||typeof o!=='object')throw Error('アウトカムの形式が正しくありません。');
      const n=outcomeBase();for(const k of Object.keys(n))n[k]=read(o,k,n[k]);
      if(!n.reviewOutcomeName)throw Error('アウトカム名を入力してください。');
      if(n.timeSelectionRule==='exact interval')n.timeSelectionRule='exact only';
      if(!n.targetTime&&n.timeWindowLower!==''&&n.timeWindowUpper!=='')n.targetTime=n.timeWindowLower+'–'+n.timeWindowUpper+' '+n.timeUnit;
      Object.assign(n,parseTime(n.targetTime));
      if(!resultTypes.includes(n.resultType)||!timeRules.includes(n.timeSelectionRule))throw Error('結果種別または時点ルールが不正です。');
      for(const k of ['timeWindowLower','timeWindowUpper'])if(n[k]!==''&&(!Number.isFinite(Number(n[k]))||Number(n[k])<0))throw Error('時間範囲は0以上の数値です。');
      if(n.timeWindowLower!==''&&n.timeWindowUpper!==''&&Number(n.timeWindowLower)>Number(n.timeWindowUpper))throw Error('時間範囲の下限が上限を超えています。');
      return n;
    });
    if(new Set(p.outcomes.map(o=>o.reviewOutcomeName)).size!==p.outcomes.length)throw Error('アウトカム名の重複を解消してください。');
    return p;
  }
  let profiles=[],activeId=null,origins={},loadingError='';
  try {
    const saved=JSON.parse(localStorage.getItem(KEY)||'null');
    if(saved){if(saved.version!==1||!Array.isArray(saved.profiles)||saved.profiles.length>20)throw Error();
      profiles=saved.profiles.map(x=>({id:String(x.id),profile:validateProfile(x.profile)}));
      if(new Set(profiles.map(p=>p.id)).size!==profiles.length)throw Error();
      activeId=profiles.some(p=>p.id===saved.activeId)?saved.activeId:null;
    }
  }catch(_){profiles=[];activeId=null;loadingError='レビュー設定を読み込めませんでした。JSONから再設定できます。';}
  const selected=()=>profiles.find(p=>p.id===activeId)?.profile||null;
  let profileSuppressed=false,pdfFingerprint=null,decisions={};
  const DECISION_KEY='dataex:profile-decisions:v1',profileFields=['outcomes','timepoint','population-rule'];
  try { const saved=JSON.parse(localStorage.getItem(DECISION_KEY)||'{}'); if(saved&&typeof saved==='object'&&!Array.isArray(saved))decisions=saved; } catch(_) {}
  const signature=()=>JSON.stringify(selected());
  const decisionKey=()=>JSON.stringify([pdfFingerprint,activeId]);
  function decision(){if(!selected())return 'SUPPRESS';const d=decisions[decisionKey()];return pdfFingerprint&&d?.signature===signature()&&['USE','SUPPRESS'].includes(d.value)?d.value:'UNDECIDED';}
  function saveDecisions(){try{localStorage.setItem(DECISION_KEY,JSON.stringify(decisions));}catch(_){loadingError='このPDFのレビュー設定の選択を保存できませんでした。';}}
  function clearProfileFields(){for(const k of profileFields)if(origins[k]==='profile'){$(k).value='';delete origins[k];}}
  function decide(value){if(!pdfFingerprint||!selected())return;decisions[decisionKey()]={value,signature:signature()};saveDecisions();profileSuppressed=value==='SUPPRESS';if(profileSuppressed)clearProfileFields();else applyDefaults(false);renderBar();$('conditions').dispatchEvent(new Event('input',{bubbles:true}));}
  function newPdf(key){if(pdfFingerprint!==key)clearProfileFields();pdfFingerprint=key;profileSuppressed=decision()==='SUPPRESS'&&!!selected();renderBar();}
  const active=()=>decision()==='USE'?selected():null;
  function commit(next,id){const changed=id!==activeId||JSON.stringify(next.find(x=>x.id===id)?.profile||null)!==signature();localStorage.setItem(KEY,JSON.stringify({version:1,profiles:next,activeId:id}));if(changed)clearProfileFields();profiles=next;activeId=id;if(changed){for(const key of Object.keys(decisions)){try{if(JSON.parse(key)[1]===id)delete decisions[key];}catch(_){delete decisions[key];}}saveDecisions();}profileSuppressed=decision()==='SUPPRESS'&&!!selected();renderBar();$('conditions').dispatchEvent(new Event('input',{bubbles:true}));}
  const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const bar=el('div');bar.id='profile-bar';
  const title=el('span'),open=el('button','設定'),hint=el('p');open.type='button';open.id='profile-open';hint.className='hint';hint.id='profile-origin';bar.append(title,open,hint);$('conditions-pane').prepend(bar);
  const dialog=el('dialog');dialog.id='profile-dialog';dialog.setAttribute('aria-labelledby','profile-heading');document.body.append(dialog);
  const heading=el('h2','レビュー設定');heading.id='profile-heading';dialog.append(heading);
  const message=el('p');message.id='profile-message';message.setAttribute('role','status');
  const toolbar=el('div');toolbar.className='profile-actions';
  const chooser=el('select');chooser.id='profile-select';chooser.setAttribute('aria-label','保存済みレビュー設定');toolbar.append(chooser);
  const button=(parent,id,text,fn)=>{const b=el('button',text);b.type='button';b.id=id;b.addEventListener('click',()=>{try{fn();}catch(e){message.textContent=e.message;}});parent.append(b);return b;};
  const activation=el('section');activation.id='profile-activation';activation.setAttribute('role','status');activation.hidden=true;
  activation.append(el('h3','レビュー設定を確認してください'));const activationText=el('p');activation.append(activationText);bar.after(activation);
  button(activation,'profile-pdf-use','このPDFに使用する',()=>decide('USE'));
  button(activation,'profile-pdf-suppress','今回だけ使用しない',()=>decide('SUPPRESS'));
  button(activation,'profile-pdf-change','レビュー設定を変更',()=>{edit(activeId);dialog.showModal();});
  let editingId=null;
  button(toolbar,'profile-apply','この設定を使用',()=>{if(!editingId)throw Error('保存済みの設定を選択してください。');commit(profiles,editingId);applyDefaults();dialog.close();});
  button(toolbar,'profile-new','新規',()=>edit(null));
  button(toolbar,'profile-off','設定を使わない',()=>{commit(profiles,null);origins={};renderBar();dialog.close();});
  button(toolbar,'profile-dismiss','閉じる',()=>dialog.close());
  dialog.append(toolbar);
  const form=el('form');form.id='profile-form';dialog.append(form,message);
  const inputs={},outcomeEditors=[];
  function field(parent,key,label,value,options){
    const wrap=el('label',label),input=el(options?'select':typeof value==='boolean'?'input':Array.isArray(value)?'textarea':'input');
    input.dataset.field=key;
    if(options)for(const option of options){const o=el('option',timeLabels[option]||({'raw arm values':'生の群別値を優先','adjusted effect':'調整済み効果量を優先','any':'指定なし','final value':'最終値','change from baseline':'ベースラインからの変化量','responder':'改善した人数・割合','binary event':'イベント人数・割合','model-based effect':'モデルによる効果量'})[option]||option);o.value=option;input.append(o);}
    if(typeof value==='boolean'){input.type='checkbox';input.checked=value;}else{input.value=Array.isArray(value)?value.join('\n'):value;input.maxLength=Array.isArray(value)?26000:2000;}
    wrap.append(input);parent.append(wrap);return input;
  }
  const advanced=parent=>{const d=el('details');d.append(el('summary','詳細設定'));parent.append(d);return d;};
  function outcomeEditor(o){
    const box=el('fieldset');box.className='profile-outcome';box.append(el('legend','アウトカム'));const fields={};
    const add=(parent,k,label,options)=>fields[k]=field(parent,k,label,o[k],options);
    add(box,'reviewOutcomeName','アウトカム名');add(box,'preferredMeasures','優先する測定法（任意）');fields.preferredMeasures.placeholder='未指定なら原著内の候補を探索';fields.preferredMeasures.rows=1;
    add(box,'targetTime','時点');fields.targetTime.placeholder='例：1–2 weeks / 3 months';
    add(box,'timeSelectionRule','時点の選び方',timeRules);
    const d=advanced(box);add(d,'preferredPopulation','優先する解析集団（任意）');fields.preferredPopulation.placeholder='例：ITT / FAS / PP / Safety';add(d,'allowedPopulations','許容する解析集団（1行に1つ）');
    const more=advanced(d);more.querySelector('summary').textContent='さらに詳細';add(more,'clinicalConcept','臨床概念');add(more,'allowedMeasures','同等とみなせる測定法（1行に1つ）');add(more,'resultType','結果の種別',resultTypes);add(more,'notes','注記');
    const entry={box,fields};outcomeEditors.push(entry);
    button(box,'','このアウトカムを削除',()=>{box.remove();outcomeEditors.splice(outcomeEditors.indexOf(entry),1);});$('profile-outcomes').append(box);
  }
  function edit(id){
    editingId=id;message.textContent='';chooser.replaceChildren();
    const empty=el('option','新しいレビュー設定');empty.value='';chooser.append(empty);
    for(const item of profiles){const o=el('option',item.profile.profileName);o.value=item.id;chooser.append(o);}chooser.value=id||'';
    form.replaceChildren();outcomeEditors.length=0;
    const p=clone(profiles.find(x=>x.id===id)?.profile||base());
    inputs.profileName=field(form,'profileName','レビュー名',p.profileName);
    const list=el('div');list.id='profile-outcomes';form.append(list);for(const o of p.outcomes.length?p.outcomes:[outcomeBase()])outcomeEditor(o);
    button(form,'profile-add-outcome','＋アウトカムを追加',()=>{if(outcomeEditors.length>=50)throw Error('アウトカムは最大50件です。');outcomeEditor(outcomeBase());});
    const d=advanced(form);
    d.append(el('h3','連続値'));
    inputs.allowSEtoSD=field(d,'allowSEtoSD','SEからSDへの変換を許可',p.allowSEtoSD);d.append(el('p','対応するnが原著で確認できる場合だけ変換します'));
    inputs.allowCItoSE=field(d,'allowCItoSE','CIからSEへの変換を許可',p.allowCItoSE);
    inputs.valuePreference=field(d,'valuePreference','優先する値',p.preferAdjustedEffect?'adjusted effect':'raw arm values',['raw arm values','adjusted effect']);
    const more=advanced(d);more.querySelector('summary').textContent='さらに詳細';
    const labels={studyDesign:'研究デザイン',analysisUnit:'解析単位',synthesisNodeRule:'統合時の群のまとめ方',allowScaleConversion:'尺度変換を許可',denominatorPreference:'二値アウトカムの分母の優先ルール',eventUnit:'イベントの単位',allowStructuralZero:'構造的ゼロを許可'};
    for(const [k,label]of Object.entries(labels))inputs[k]=field(more,k,label,p[k]);
    more.append(el('p','対応人数の自動代入と、有害事象の種類別人数の単純合算は行いません。'),el('p','図からの推定値はPhase 3で対応'));
    const save=el('button','保存');save.id='profile-save';save.type='submit';form.append(save);
  }
  const actions=el('div');actions.className='profile-actions';dialog.append(actions);
  button(actions,'profile-duplicate','複製',()=>{const p=readEditor();p.profileName+='（コピー）';saveProfile(p,null);edit(activeId);});
  button(actions,'profile-delete','削除',()=>{if(!editingId)throw Error('保存済みの設定を選択してください。');const id=editingId;commit(profiles.filter(x=>x.id!==id),activeId===id?null:activeId);edit(activeId);renderBar();});
  button(actions,'profile-export','JSONエクスポート',()=>{const p=readEditor(),url=URL.createObjectURL(new Blob([JSON.stringify({version:1,profiles:[{profile:p}]},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='dataex-review-profile.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const upload=el('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;upload.id='profile-import-file';actions.append(upload);
  button(actions,'profile-import','JSONインポート',()=>upload.click());
  button(actions,'profile-close','閉じる',()=>dialog.close());
  const value=input=>input.type==='checkbox'?input.checked:input.tagName==='TEXTAREA'?input.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean):input.value;
  function readEditor(){const p=base();for(const k of Object.keys(p))if(inputs[k])p[k]=value(inputs[k]);p.preferAdjustedEffect=inputs.valuePreference.value==='adjusted effect';p.preferRawArmValues=!p.preferAdjustedEffect;p.outcomes=outcomeEditors.map(e=>Object.fromEntries(Object.entries(e.fields).map(([k,v])=>[k,value(v)])));return validateProfile(p);}
  function saveProfile(p,id){if(!id&&profiles.length>=20)throw Error('レビュー設定は最大20件です。');const next=clone(profiles);const entry={id:id||crypto.randomUUID(),profile:validateProfile(p)},i=next.findIndex(x=>x.id===id);if(i<0)next.push(entry);else next[i]=entry;commit(next,entry.id);}
  form.addEventListener('submit',e=>{e.preventDefault();try{saveProfile(readEditor(),editingId);applyDefaults();dialog.close();}catch(err){message.textContent=err.message;}});
  upload.addEventListener('change',async()=>{try{const file=upload.files[0];if(!file)return;if(file.size>1000000)throw Error('JSONは1MB以内にしてください。');const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.profiles)||!data.profiles.length||profiles.length+data.profiles.length>20)throw Error('version 1のJSONと、合計20件以内の設定が必要です。');const added=data.profiles.map(x=>({id:crypto.randomUUID(),profile:validateProfile(x.profile)}));commit([...profiles,...added],activeId);edit(added[0].id);message.textContent=added.length+'件インポートしました。「この設定を使用」で適用できます。';}catch(e){message.textContent='インポートできません：'+e.message;}finally{upload.value='';}});
  chooser.addEventListener('change',()=>edit(chooser.value||null));
  open.addEventListener('click',()=>{edit(activeId);dialog.showModal();});
  function defaults(){const p=active();if(!p)return {};const times=p.outcomes.map(o=>o.targetTime||([o.timeWindowLower,o.timeWindowUpper].every(x=>x!=='')?`${o.timeWindowLower}–${o.timeWindowUpper} ${o.timeUnit}`:''));const pops=p.outcomes.map(o=>o.preferredPopulation);return {outcomes:p.outcomes.map(o=>o.reviewOutcomeName).join('\n'),timepoint:times.every(t=>t===times[0])?times[0]:'','population-rule':pops.every(t=>t===pops[0])?pops[0]:''};}
  function applyDefaults(notify=true){if(!active())return;for(const [k,v]of Object.entries(defaults())){if(origins[k]==='explicit'||($(k).value.trim()&&origins[k]!=='profile'))continue;$(k).value=v;origins[k]='profile';}renderBar();if(notify)$('conditions').dispatchEvent(new Event('input',{bubbles:true}));}
  $('conditions').addEventListener('input',e=>{if(profileFields.includes(e.target.id))origins[e.target.id]='explicit';renderBar();});
  function renderBar(){const d=decision();title.textContent='レビュー設定：'+(selected()?.profileName||'未設定')+(selected()&&pdfFingerprint?(d==='USE'?'（このPDFに適用）':d==='SUPPRESS'?'（このPDFでは未使用）':''): '');open.textContent=selected()?'変更':'設定';hint.textContent=loadingError||(active()?'このPDFに適用中／手入力を優先':'');activation.hidden=!selected()||!pdfFingerprint||d!=='UNDECIDED';activationText.textContent='現在のレビュー設定：'+(selected()?.profileName||'')+'。このPDFにも同じレビュー設定を使用しますか？ レビュー設定をこのPDFに使うか選択してください';}
  function context(){return {profileId:activeId,origins:clone(origins),profileSuppressed,pdfFingerprint,profileDecision:decision()};}
  function restoreContext(c,key){pdfFingerprint=key;origins={};for(const k of profileFields){if(['profile','explicit'].includes(c?.origins?.[k]))origins[k]=c.origins[k];else if($(k).value.trim())origins[k]='explicit';}profileSuppressed=decision()==='SUPPRESS'&&!!selected();if(decision()!=='USE'||c?.profileId!==activeId)clearProfileFields();renderBar();}
  function compactOutcome(o){const result={reviewOutcomeName:o.reviewOutcomeName,preferredMeasures:clone(o.preferredMeasures),targetTime:o.targetTime,timeSelectionRule:o.timeSelectionRule};const def=outcomeBase();for(const k of ['clinicalConcept','allowedMeasures','resultType','preferredPopulation','allowedPopulations','notes'])if(JSON.stringify(o[k])!==JSON.stringify(def[k]))result[k]=clone(o[k]);return result;}
  function compactProfile(p){if(!p)return null;const result={profileName:p.profileName,outcomes:p.outcomes.map(compactOutcome)},def=base();for(const k of ['studyDesign','analysisUnit','synthesisNodeRule','allowSEtoSD','allowCItoSE','allowScaleConversion','preferRawArmValues','preferAdjustedEffect','denominatorPreference','eventUnit','allowStructuralZero'])if(p[k]!==def[k])result[k]=p[k];return result;}
  function brief(current){const p=active();const map={intervention:'intervention',comparator:'comparator',outcomes:'outcomes',timepoint:'timepoint',populationRule:'population-rule'};const values={...current},provenance={};const def=defaults();
    for(const [k,id]of Object.entries(map)){const has=Array.isArray(current[k])?current[k].length:current[k]?.trim();const origin=origins[id];if(!has&&p&&origin!=='explicit'&&def[id])values[k]=k==='outcomes'?def[id].split('\n'):def[id];const actual=Array.isArray(current[k])?current[k].join('\n'):current[k];provenance[k]=origin==='explicit'||(has&&(!p||origin!=='profile'||actual!==def[id]))?'current PDF form explicit input':p&&def[id]?'active Review Profile':'unresolved';}
    const outcomes=(p?.outcomes||[]).filter(o=>values.outcomes.some(name=>[o.reviewOutcomeName,o.clinicalConcept,...o.preferredMeasures,...o.allowedMeasures].filter(Boolean).some(alias=>concept(alias)===concept(name)))).map(o=>({...compactOutcome(o),applyTimeRule:provenance.timepoint!=='current PDF form explicit input',applyPopulationRule:provenance.populationRule!=='current PDF form explicit input'}));
    return {...values,profileDecisionForPdf:decision(),profileConflict:conflict(current),profileSuppressed,activeReviewProfile:compactProfile(p),profileRulesApplied:{precedence:['current PDF form explicit input','active Review Profile','unresolved'],fieldProvenance:provenance,outcomes,instructions:'InterventionとComparatorは現在の抽出フォームのみを使用する。設定に省略された変換許可はfalse、効果の既定優先は生の群別値。フォームの明示値を最優先。対応するレビュー設定の測定項目優先順・時点ルール・集団指定で解決済みの選択は再質問しない。explicit時点/集団と矛盾するprofileルールは適用しない。別名アウトカムへの対応が不明なら推測しない。原著との不一致や欠測値は残す。SE→SDはallowSEtoSD=trueかつ当該mean/SEに対応するnが原著で明示または一意に解決され、nのsource anchorがある場合のみ。割付N・完了者Nの自動代入・人数按分は禁止。変換不能ならCANDIDATE_ONLYまたはNEEDS_REVIEW。図からの推定は禁止。'}};
  }
  const canonical=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  // Only explicit aliases/equivalent labels are accepted, never fuzzy substring matches.
  const conceptAliases=[['pain intensity','pain score','疼痛強度','痛みの強さ'],['visual acuity','視力'],['serious ocular adverse event','serious ocular adverse events','重篤な眼有害事象']];
  const concept=text=>{const key=canonical(text);const group=conceptAliases.find(g=>g.some(v=>canonical(v)===key));return group?canonical(group[0]):key;};
  function timeKey(text){
    const clean=String(text||'').normalize('NFKC').toLowerCase().replace(/post\s*|follow[- ]?up\s*/g,'').replace(/wks?\b/g,'weeks').replace(/[–—〜～]/g,'-').trim();
    const m=clean.match(/^(?:(days?|weeks?|months?|years?|日|週|週間|か月|ヶ月|月|年)\s*)?(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*(days?|weeks?|months?|years?|日|週|週間|か月|ヶ月|月|年)?$/);
    if(!m||!(m[1]||m[4]))return canonical(clean);
    let unit=m[1]||m[4];unit=/week|週/.test(unit)?'week':/day|日/.test(unit)?'day':/month|月/.test(unit)?'month':'year';
    return unit+':'+Number(m[2])+':'+Number(m[3]||m[2]);
  }
  function conflict(current) {
    const p=selected(),items=[];
    if(!p)return {hasConflict:false,resolved:true,items};
    const currentNames=(current.outcomes||[]).filter(s=>s.trim());
    const matchesName=(o,name)=>[o.reviewOutcomeName,o.clinicalConcept,...o.preferredMeasures,...o.allowedMeasures].filter(Boolean).some(alias=>concept(alias)===concept(name));
    for(const name of currentNames)if(!p.outcomes.some(o=>matchesName(o,name)))items.push({field:'outcome',profileValue:p.outcomes.map(o=>o.reviewOutcomeName).join(' / '),currentValue:name});
    const time=current.timepoint?.trim();
    const targets=(currentNames.length?p.outcomes.filter(o=>currentNames.some(n=>matchesName(o,n))):p.outcomes).map(o=>o.targetTime).filter(Boolean);
    if(time) {
      const relevant=targets.length?targets:p.outcomes.map(o=>o.targetTime).filter(Boolean);
      if(relevant.some(target=>timeKey(target)!==timeKey(time)))items.push({field:'timepoint',profileValue:[...new Set(relevant)].join(' / '),currentValue:time});
    }
    return {hasConflict:items.length>0,resolved:profileSuppressed||items.length===0,items};
  }
  const conflictDialog=el('dialog');conflictDialog.id='profile-conflict-dialog';conflictDialog.setAttribute('aria-labelledby','profile-conflict-heading');
  const conflictHeading=el('h2','レビュー設定が今回の抽出条件と一致しません');conflictHeading.id='profile-conflict-heading';
  const conflictName=el('p'),conflictItems=el('div');conflictItems.id='profile-conflict-items';
  conflictDialog.append(conflictHeading,conflictName,conflictItems);document.body.append(conflictDialog);
  let settleConflict=null;
  function settle(value){const fn=settleConflict;settleConflict=null;conflictDialog.close();fn?.(value);}
  button(conflictDialog,'profile-conflict-suppress','今回だけレビュー設定を使わない',()=>{decide('SUPPRESS');settle(true);});
  button(conflictDialog,'profile-conflict-change','レビュー設定を変更',()=>{settle(false);edit(activeId);dialog.showModal();});
  button(conflictDialog,'profile-conflict-cancel','キャンセル',()=>settle(false));
  conflictDialog.addEventListener('cancel',e=>{e.preventDefault();settle(false);});
  conflictDialog.addEventListener('close',()=>{if(settleConflict){const fn=settleConflict;settleConflict=null;fn(false);}});
  async function confirmExtraction(current){
    if(decision()==='UNDECIDED'){renderBar();activation.scrollIntoView({block:'nearest'});$('profile-pdf-use').focus();return false;}const status=conflict(current);if(!status.hasConflict||status.resolved)return true;
    if(settleConflict)return false;
    conflictName.textContent='現在のレビュー設定：'+selected().profileName;
    conflictItems.replaceChildren(el('p','今回のアウトカム：'),...current.outcomes.map(name=>el('p','・'+name)),...status.items.map(item=>el('p',(item.field==='outcome'?'アウトカム':'時点')+'：設定「'+item.profileValue+'」／今回「'+item.currentValue+'」')));
    return new Promise(resolve=>{settleConflict=resolve;conflictDialog.showModal();$('profile-conflict-suppress').focus();});
  }

  window.dataexReviewProfile={active:()=>active()?clone(active()):null,brief,applyDefaults,context,restoreContext,confirmExtraction,newPdf};
  applyDefaults(false);renderBar();
})();
