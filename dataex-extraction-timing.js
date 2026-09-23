/* Observational timing only: no PDF, Prompt, Raw, model, or decision data enters this module. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DataExExtractionTiming = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const STORAGE_KEY = 'dataex:extraction-timing:v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const quiet = fn => { try { return fn(); } catch (_) { /* Timing must never interrupt extraction. */ } };
  const key = meta => meta && typeof meta.requestId === 'string' && meta.requestId && typeof meta.pdfId === 'string' && meta.pdfId
    ? JSON.stringify([meta.reviewId || '', meta.pdfId, meta.requestId]) : null;
  const elapsed = (start, end) => {
    if (!start || !end) return null;
    const value = start.origin === end.origin && Number.isFinite(start.mono) && Number.isFinite(end.mono)
      ? end.mono - start.mono : end.wall - start.wall;
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  function create({clock, read = () => [], write = () => {}, changed = () => {}}) {
    const entries = new Map(); let selected = null, sequence = 0;
    const stamp = () => { const s = clock(); return {wall:s.wall, mono:s.mono, origin:s.origin}; };
    const validStamp = s => s == null || Number.isFinite(s.wall) && Number.isFinite(s.mono) && Number.isFinite(s.origin);
    const stored = quiet(read);
    for (const item of Array.isArray(stored) ? stored.slice(-20) : []) {
      if (typeof item.key !== 'string' || item.key.length > 1000 || !['waiting','importing','complete','json-complete','failed'].includes(item.status)) continue;
      if (![item.copied,item.received,item.completed].every(validStamp)) continue;
      entries.set(item.key, {key:item.key, copied:item.copied || null, received:item.received || null, completed:item.completed || null,
        status:item.status === 'importing' ? 'failed' : item.status, saveWarning:!!item.saveWarning, attempt:0});
    }
    function notify(save = true) {
      while (entries.size > 20) entries.delete(entries.keys().next().value);
      if (save) quiet(() => write(clone([...entries.values()])));
      quiet(changed);
    }
    function select(meta) { const next = key(meta); if (selected !== next) { selected = next; notify(false); } }
    function copied(meta) {
      const id = key(meta); if (!id) return;
      select(meta);
      // Re-copying one request must not erase time already spent waiting.
      if (entries.has(id)) return;
      entries.set(id, {key:id, copied:stamp(), received:null, completed:null, status:'waiting', saveWarning:false, attempt:0}); notify();
    }
    function receive(meta) {
      const id = key(meta); if (!id) return null;
      const when = stamp(); select(meta);
      let item = entries.get(id);
      if (item && ['complete','json-complete','importing'].includes(item.status)) return null;
      if (!item) { item = {key:id,copied:null,received:null,completed:null,saveWarning:false}; entries.set(id,item); }
      item.received = when; item.completed = null; item.status = 'importing'; item.attempt = ++sequence; notify();
      return {key:id, attempt:item.attempt};
    }
    function finish(ticket, failed, saveWarning = false) {
      if (!ticket) return;
      const item = entries.get(ticket.key);
      if (!item || item.attempt !== ticket.attempt || item.status !== 'importing') return;
      item.completed = failed ? null : stamp(); item.status = failed ? 'failed' : 'complete'; item.saveWarning = !!saveWarning; notify();
    }
    function jsonComplete(meta) {
      const id=key(meta);if(!id)return;select(meta);
      const previous=entries.get(id);
      if(previous&&['complete','json-complete'].includes(previous.status))return;
      // File parsing, validation and confirmation have not been separately timed.
      // Record only the observed commit completion; never invent an AI arrival time.
      entries.set(id,{key:id,copied:previous?.copied||null,received:null,completed:stamp(),status:'json-complete',saveWarning:false,attempt:++sequence});notify();
    }
    function current() {
      const item = entries.get(selected); if (!item) return null;
      const now = stamp(), active = ['waiting','importing'].includes(item.status);
      return {...clone(item), waitMs:elapsed(item.copied,item.received || (active ? now : null)),
        localMs:elapsed(item.received,item.completed || (item.status === 'importing' ? now : null)),
        totalMs:elapsed(item.copied,item.completed || (active ? now : null))};
    }
    return Object.freeze({select,copied,receive,jsonComplete,complete:(t,warning) => finish(t,false,warning),fail:t => finish(t,true),current});
  }
  function duration(ms) {
    if (ms == null) return '—';
    if (ms < 60000) return (ms / 1000).toFixed(ms < 1000 ? 3 : 1) + '秒';
    return Math.floor(ms / 60000) + '分' + (ms / 1000 % 60).toFixed(1) + '秒';
  }
  function mount(root, environment = window) {
    if (!root) return null;
    const document = root.ownerDocument, el = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
    root.classList.add('extraction-timing'); root.setAttribute('aria-label','抽出の所要時間');
    const summary = el('div'); summary.className = 'extraction-timing-summary';
    const fields = ['AI抽出待ち時間','DataEx処理時間','総時間'].map(label => { const n = el('span'); n.dataset.timingMetric=label;summary.append(n);return n; });
    const state = el('span'); state.className='extraction-timing-state';summary.append(state);
    const detail = el('details'), heading = el('summary','計測時刻'); detail.append(heading);
    const timestamps = ['① 抽出依頼コピー','② 結果受信','③ import完了'].map(label => { const p=el('p',label+'：'),time=el('time');p.append(time);detail.append(p);return time; });
    detail.append(el('p','AI抽出待ち時間はコピーから結果受信までです。貼り付け・送信・通信などの待ち時間も含み、AIの純粋な推論時間ではありません。同じ依頼の再コピーでは開始時刻を維持します。'));
    const note=el('p');detail.append(note);root.replaceChildren(summary,detail);
    let timer = null, model;
    const stop = () => { if (timer != null) environment.clearInterval(timer); timer=null; };
    const render = () => {
      const value=model.current();root.hidden=!value;
      if (!value) { stop();return; }
      [value.waitMs,value.localMs,value.totalMs].forEach((ms,i)=>{fields[i].textContent=['AI抽出待ち時間','DataEx処理時間','総時間'][i]+' '+duration(ms);});
      state.textContent={waiting:'結果待ち',importing:'取込中',complete:value.saveWarning?'完了（保存警告あり）':'完了','json-complete':'登録完了（JSON経由・区間未計測）',failed:'取込未完了'}[value.status];
      root.dataset.timingState=value.status;
      [value.copied,value.received,value.completed].forEach((s,i)=>{timestamps[i].textContent=s?new Date(s.wall).toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hour12:false}):'未記録';if(s)timestamps[i].dateTime=new Date(s.wall).toISOString();else timestamps[i].removeAttribute('datetime');});
      note.textContent=value.status==='json-complete'?'JSONの読込・確認待ち・登録処理を分けて計測していないため、AI抽出待ち時間とDataEx処理時間は未計測です。総時間は同じ依頼のコピー時刻が記録されている場合だけ表示します。':!value.copied?'コピー時刻の記録がないため、待ち時間と総時間は算定できません。':value.status==='failed'?'importが完了していないため、完了時刻は記録していません。':'';
      if (['waiting','importing'].includes(value.status)) { if(timer==null)timer=environment.setInterval(()=>quiet(render),1000); } else stop();
    };
    model=create({clock:()=>({wall:Date.now(),mono:environment.performance.now(),origin:environment.performance.timeOrigin}),
      read:()=>JSON.parse(environment.sessionStorage.getItem(STORAGE_KEY)||'[]'),
      write:entries=>environment.sessionStorage.setItem(STORAGE_KEY,JSON.stringify(entries)),changed:render});
    environment.addEventListener('pagehide',stop);
    environment.addEventListener('pageshow',()=>quiet(render));
    return model;
  }
  return Object.freeze({STORAGE_KEY,create,mount,duration});
});
