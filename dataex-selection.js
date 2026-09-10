/* Manual PDF regions only. No site tools, network requests or persistent images. */
'use strict';
window.createDataExSelection = function ({ state, viewer, renderPage }) {
  const $ = id => document.getElementById(id);
  const node = (tag, text) => { const e = document.createElement(tag); if (text) e.textContent = text; return e; };
  const controls = node('div'); controls.id = 'selection-controls'; controls.className = 'selection-toolbar';
  const buttons = (parent, id, text, action) => { const b = node('button', text); b.id = id; b.type = 'button'; b.addEventListener('click', action); parent.append(b); return b; };
  const modes = node('div'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'PDF操作モード'); controls.append(modes);
  const textMode = buttons(modes, 'selection-text', 'テキスト', () => setMode(false));
  const regionMode = buttons(modes, 'selection-region', '範囲選択', () => setMode(true));
  controls.append(node('span', '図・表を囲んで選択できます'));
  const info = node('div'); info.id = 'selection-actions'; info.hidden = true;
  const label = node('span'); info.append(label);
  const previewButton = buttons(info, 'selection-preview', 'プレビュー', preview);
  buttons(info, 'selection-redraw', '選択をやり直す', redo);
  buttons(info, 'selection-cancel', 'キャンセル', () => clearSelection(true));
  const selectedBar = node('div'); selectedBar.id = 'selection-active'; selectedBar.hidden = true;
  const selectedLabel = node('span'); selectedBar.append(selectedLabel);
  buttons(selectedBar, 'selection-show', '表示', showSelection);
  buttons(selectedBar, 'selection-clear', '解除', () => clearSelection(true));
  const extractButton = buttons(selectedBar, 'selection-extract', 'この範囲を抽出', () => extractHandler?.());
  const notice = node('p'); notice.id = 'selection-message'; notice.setAttribute('role', 'status');
  controls.append(info, selectedBar, notice); $('evidence-bar').before(controls);

  const dialog = node('dialog'); dialog.id = 'selection-dialog'; dialog.setAttribute('aria-labelledby', 'selection-preview-title');
  const heading = node('h2', '選択範囲を確認してください'); heading.id = 'selection-preview-title'; dialog.append(heading);
  const tools = node('div'); tools.className = 'selection-preview-tools';
  buttons(tools, 'crop-zoom-out', '縮小', () => previewZoom(-.25));
  const zoomLabel = node('span'); tools.append(zoomLabel);
  buttons(tools, 'crop-zoom-in', '拡大', () => previewZoom(.25));
  buttons(tools, 'crop-fit', '全体表示', () => { imageScale = 1; layoutImage(); }); dialog.append(tools);
  const stage = node('div'); stage.id = 'selection-image-stage'; const image = node('img'); image.id = 'selection-image'; image.alt = '選択したPDF範囲'; stage.append(image); dialog.append(stage);
  const meta = node('p'); meta.id = 'selection-meta'; const aiConditions=node('p');aiConditions.id='selection-ai-conditions';dialog.append(meta, aiConditions, node('p', '選択画像はDataExブラウザ内に表示され、外部LLM APIには送信しません。'));
  const guide=node('div');guide.id='selection-ai-guide';guide.hidden=true;const guideText=node('p');guide.append(guideText);const repeat=buttons(guide,'selection-copy-again','もう一度コピー',()=>extractHandler?.());dialog.append(guide);
  const actions = node('div'); actions.className = 'selection-preview-tools';
  buttons(actions, 'crop-use', 'この選択を使用', () => { if (!active || !blob) return; active.status = 'READY'; active.accepted = true; closePreview(); setMode(false); sync(); acceptHandler?.(structuredClone(active)); });
  buttons(actions, 'crop-redo', 'やり直す', () => { closePreview(); redo(); });
  buttons(actions, 'crop-close', '閉じる', closePreview); dialog.append(actions); document.body.append(dialog);
  const back=buttons(actions,'crop-back-pdf','元PDFへ戻る',()=>{closePreview();showSelection();});back.hidden=true;
  let mode = false, active = null, drag = null, blob = null, url = null, cropTask = null, revision = 0, busy = false, imageScale = 1, returnFocus = null;
  let aiMode=false,extractHandler=null,acceptHandler=null,sourceRegion=null;
  const ready = () => !!state.pdf && !state.loading;
  const tell = (text = '', error = false) => { notice.textContent = text; notice.classList.toggle('error', error); };
  function setMode(value) { cancelDrag(); mode = value && ready(); viewer.classList.toggle('region-mode', mode); textMode.setAttribute('aria-pressed', String(!mode)); regionMode.setAttribute('aria-pressed', String(mode)); }
  function sync() {
    regionMode.disabled = !ready(); textMode.disabled = !ready();
    info.hidden = !active; selectedBar.hidden = !active?.accepted;
    label.textContent = active ? `選択範囲：PDF p.${active.page}` : '';
    selectedLabel.textContent = active ? `選択中：PDF p.${active.page}` : '';
    previewButton.disabled = busy; previewButton.textContent = busy ? '画像を作成中…' : 'プレビュー';
  }
  function dropCrop() { cropTask?.cancel(); cropTask = null; blob = null; if (url) URL.revokeObjectURL(url); url = null; image.removeAttribute('src'); }
  function closePreview() { if (dialog.open) dialog.close(); aiMode=false; if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); }
  function cancelDrag() {
    const old = drag; drag = null; viewer.classList.remove('region-dragging');
    if (old && viewer.hasPointerCapture(old.id)) viewer.releasePointerCapture(old.id);
    redraw();
  }
  function clearSelection(focus = false) { revision++; cancelDrag(); active = null; sourceRegion=null; busy = false; dropCrop(); closePreview(); redraw(); sync(); tell(); if (focus) (mode ? regionMode : textMode).focus({ preventScroll: true }); }
  function reset() { clearSelection(); setMode(false); sync(); }
  function redo() { const page = active?.page; clearSelection(); setMode(true); regionMode.focus({ preventScroll: true }); if (page) $(`pdf-page-${page}`)?.scrollIntoView({ block: 'start' }); tell('図・表を囲んで選択してください'); }
  function paint(page, rect) {
    const host = $(`pdf-page-${page}`); if (!host) return;
    const overlay = node('div'); overlay.className = 'manual-selection'; overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }); host.append(overlay);
  }
  function redraw() { viewer.querySelectorAll('.manual-selection').forEach(e => e.remove()); if(sourceRegion)paint(sourceRegion.page,sourceRegion.normalizedRect);else if (drag) paint(drag.page, drag.rect); else if (active) paint(active.page, active.normalizedRect); }
  function point(event, host) { const r = host.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)) }; }
  viewer.addEventListener('pointerdown', event => {
    if (!mode || !ready() || busy || event.button !== 0) return;
    const host = event.target.closest('.pdf-page'); if (!host?.querySelector('canvas')) return;
    event.preventDefault(); sourceRegion=null; const start = point(event, host);
    drag = { id: event.pointerId, host, page: Number(host.dataset.page), start, rect: { ...start, width: 0, height: 0 }, scale: state.scale, generation: state.generation };
    viewer.setPointerCapture(event.pointerId); viewer.classList.add('region-dragging'); redraw();
  }, true);
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const end = point(event, drag.host), start = drag.start;
    drag.rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) }; redraw();
  }
  viewer.addEventListener('pointermove', move);
  viewer.addEventListener('pointerup', async event => {
    if (!drag || event.pointerId !== drag.id) return;
    move(event); const d = drag, size = d.host.getBoundingClientRect(); cancelDrag();
    if (d.rect.width * size.width < 20 || d.rect.height * size.height < 20) { tell('20×20ピクセル以上の範囲を囲んでください'); return; }
    const token = ++revision;
    try {
      const page = await state.pdf.getPage(d.page);
      if (token !== revision || d.generation !== state.generation || d.scale !== state.scale) return;
      dropCrop(); const r = d.rect, viewport = page.getViewport({ scale: d.scale });
      const a = viewport.convertToPdfPoint(r.x * viewport.width, r.y * viewport.height), b = viewport.convertToPdfPoint((r.x + r.width) * viewport.width, (r.y + r.height) * viewport.height);
      active = { selectionId: `sel-${crypto.randomUUID()}`, page: d.page, normalizedRect: { ...r }, cssRect: { x: r.x * size.width, y: r.y * size.height, width: r.width * size.width, height: r.height * size.height }, pdfRect: { x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]), x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]) }, zoomAtSelection: d.scale, createdAt: new Date().toISOString(), status: 'SELECTED', accepted: false, mimeType: 'image/png', cropWidth: 0, cropHeight: 0 };
      tell('選択範囲を確認してください'); redraw(); sync(); previewButton.focus({ preventScroll: true });
    } catch (_) { if (token === revision) tell('範囲を選択できませんでした。もう一度囲んでください。', true); }
  });
  viewer.addEventListener('pointercancel', cancelDrag); viewer.addEventListener('lostpointercapture', cancelDrag);
  dialog.addEventListener('cancel', event => { event.preventDefault(); clearSelection(true); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (document.querySelector('dialog[open]') && !dialog.open)) return;
    if (active || drag) { event.preventDefault(); clearSelection(true); }
  });
  async function showSelection() {
    if (!active) return; sourceRegion=null; const id = active.selectionId;
    try { await renderPage(active.page); if (active?.selectionId !== id) return; redraw(); const host = $(`pdf-page-${active.page}`); (host.querySelector('.manual-selection') || host).scrollIntoView({ block: 'center', inline: 'center' }); }
    catch (_) { tell('選択範囲を表示できませんでした。PDFを確認してください。', true); }
  }
  function layoutImage() { const available = Math.max(100, stage.clientWidth - 32);const fit=aiMode?Math.min(available,Math.max(100,stage.clientHeight-32)*(active?.cropWidth||1)/(active?.cropHeight||1)):available; image.style.width = `${Math.min(active?.cropWidth || fit, fit) * imageScale}px`; zoomLabel.textContent = `${Math.round(imageScale * 100)}%`; }
  function previewZoom(delta) { imageScale = Math.max(.5, Math.min(4, imageScale + delta)); layoutImage(); }
  new ResizeObserver(() => { if (dialog.open) layoutImage(); }).observe(stage);
  async function preview() {
    if (!active || busy || !ready()) return;
    const token = revision, generation = state.generation, selected = active; returnFocus = document.activeElement; busy = true; sync(); tell('高解像度の画像を作成しています…');
    try {
      if (!blob) {
        const page = await state.pdf.getPage(selected.page), base = page.getViewport({ scale: 1 }), r = selected.normalizedRect;
        if (token !== revision || generation !== state.generation) return;
        // Independent PDF render: scale never depends on the viewer zoom. Bound both
        // the full-page buffer (16 MP) and output (8 MP, 4000 px longest edge).
        let scale = Math.min(3 * Math.min(7 / 6, Math.max(1, window.devicePixelRatio || 1)), 8190 / Math.max(base.width, base.height), Math.sqrt(15990000 / (base.width * base.height)), 3998 / Math.max(base.width * r.width, base.height * r.height), Math.sqrt(7990000 / (base.width * base.height * r.width * r.height)));
        for (let attempt = 0; attempt < 3; attempt++, scale *= .7) {
          let full = document.createElement('canvas'), crop = document.createElement('canvas'), task = null;
          try {
            const viewport = page.getViewport({ scale }); full.width = Math.ceil(viewport.width); full.height = Math.ceil(viewport.height);
            const context = full.getContext('2d'); if (!context) throw Error('canvas allocation');
            task = page.render({ canvasContext: context, viewport, background: 'white' }); cropTask = task; await task.promise; if (cropTask === task) cropTask = null;
            if (token !== revision || generation !== state.generation) return;
            const x = Math.floor(r.x * viewport.width), y = Math.floor(r.y * viewport.height), right = Math.min(full.width, Math.ceil((r.x + r.width) * viewport.width)), bottom = Math.min(full.height, Math.ceil((r.y + r.height) * viewport.height));
            crop.width = right - x; crop.height = bottom - y;
            const target = crop.getContext('2d'); if (!target) throw Error('crop allocation'); target.drawImage(full, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
            const output = await new Promise(resolve => crop.toBlob(resolve, 'image/png')); if (!output) throw Error('PNG encoding');
            if (token !== revision || generation !== state.generation) return;
            blob = output; url = URL.createObjectURL(blob); selected.cropWidth = crop.width; selected.cropHeight = crop.height; selected.renderScale = scale; selected.status = 'READY'; break;
          } catch (error) { if (token !== revision || generation !== state.generation) return; if (attempt === 2) throw error; }
          finally { full.width = full.height = crop.width = crop.height = 0; if (cropTask === task) cropTask = null; }
        }
      }
      if (token !== revision || generation !== state.generation || !blob) return;
      image.src = url; imageScale = 1; meta.textContent = `PDF p.${active.page} ｜ ${active.cropWidth} × ${active.cropHeight} px ｜ 手動の範囲選択`;
      aiMode=false;dialog.classList.remove('ai-confirmation');heading.textContent='選択範囲を確認してください';aiConditions.textContent='';guide.hidden=true;back.hidden=true;$('crop-use').hidden=false;$('crop-redo').hidden=false;$('crop-close').hidden=false;
      if(!dialog.open)dialog.showModal(); layoutImage(); $('crop-use').focus(); tell();
    } catch (_) { if (token === revision) { dropCrop(); active.status = 'SELECTED'; tell('画像を作成できませんでした。範囲を小さくして再度お試しください。', true); } }
    finally { if (token === revision) { busy = false; sync(); } }
  }
  window.DataExSelection = { getActiveSelection: () => active ? structuredClone(active) : null, getActiveCropBlob: () => blob, clearSelection: () => clearSelection() };
  setMode(false); sync();
  return { redraw, reset, sync, cancelDrag, setExtractHandler(fn){extractHandler=fn;},setAcceptHandler(fn){acceptHandler=fn;},showMessage:tell,
    isAIVisible:()=>aiMode&&dialog.open&&image.complete&&image.naturalWidth>0,
    async presentForAI(conditions){if(!active?.accepted||!blob)throw Error('選択範囲を確定してください。');await preview();if(!dialog.open)throw Error('画像を表示できませんでした。');await image.decode();aiMode=true;dialog.classList.add('ai-confirmation');heading.textContent=`AI確認用：PDF p.${active.page} 選択範囲`;aiConditions.textContent='AI確認中の選択範囲 ｜ '+conditions.outcomes.join(' / ')+(conditions.timepoint?' ｜ '+conditions.timepoint:'');back.hidden=false;$('crop-use').hidden=true;$('crop-redo').hidden=true;$('crop-close').hidden=true;layoutImage();stage.scrollTop=0;stage.scrollLeft=0;dialog.scrollTop=0;back.focus({preventScroll:true});},
    async copyAIRequest(text){guide.hidden=false;try{await navigator.clipboard.writeText(text);guideText.textContent='① 選択範囲をAI確認用に表示しました\n② 左のWorkに貼り付けて送信してください';}catch(_){guideText.textContent='自動コピーできませんでした。この文をコピーしてWorkへ送信してください：\n'+text;}layoutImage();},
    async showSource(source){if(!ready()||source.page>state.pdf.numPages)throw Error('原著PDFを再選択してください。');closePreview();const generation=state.generation;await renderPage(source.page);if(generation!==state.generation)return;sourceRegion=structuredClone(source);redraw();state.currentPage=source.page;$('page-number').value=source.page;const host=$('pdf-page-'+source.page);host.querySelector('.manual-selection')?.scrollIntoView({block:'center',inline:'center'});tell('視覚根拠：PDF p.'+source.page+' の選択範囲');}
  };
};
