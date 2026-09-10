/* Resolve presentation anchors against the current PDF text layer. No AI coordinates required. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DataExSource = api;
})(typeof window === 'undefined' ? null : window, function() {
  'use strict';
  function index(text) {
    let value=''; const offsets=[];
    for (const m of String(text || '').matchAll(/[^]/gu)) {
      const s=m[0].normalize('NFKC').toLowerCase().replace(/[−–—‐‑]/g,'-').replace(/[\s\u00ad]/g,'');
      value+=s; for(let i=0;i<s.length;i++)offsets.push({start:m.index,end:m.index+m[0].length});
    }
    return {value,offsets};
  }
  function matches(raw, text, bounds={start:0,end:raw.length}) {
    const needle=index(text).value, hay=index(raw.slice(bounds.start,bounds.end)), out=[];
    if(!needle)return out;
    for(let at=hay.value.indexOf(needle);at>=0;at=hay.value.indexOf(needle,at+needle.length))
      out.push({start:bounds.start+hay.offsets[at].start,end:bounds.start+hay.offsets[at+needle.length-1].end});
    return out;
  }
  function numericMatches(raw, text, bounds) {
    const numbers=s=>[...s.normalize('NFKC').replace(/[−–—]/g,'-').matchAll(/(?<![\d.])-?\d+(?:\.\d+)?(?![\d.])/g)].map(m=>({value:Number(m[0]),start:m.index,end:m.index+m[0].length}));
    const wanted=numbers(text.replace(/\b\d+(?:\.\d+)?\s*%\s*(?:CI|confidence intervals?)/gi,'')), found=numbers(raw.slice(bounds.start,bounds.end)), out=[];
    // An isolated number is never sufficient to locate an unscoped cell.
    if(wanted.length<2)return out;
    for(let i=0;i<=found.length-wanted.length;i++)if(wanted.every((n,j)=>n.value===found[i+j].value)) {
      const start=bounds.start+found[i].start,end=bounds.start+found[i+wanted.length-1].end;
      if(end-start<180)out.push({start,end});
    }
    return out;
  }
  function resolveText(raw, anchor, contextLabels=[]) {
    const headings=Array.isArray(contextLabels)?contextLabels:contextLabels.headings||[], rowLabels=contextLabels.rows||[];
    const all={start:0,end:raw.length}, rowParts=String(anchor.row||'').split(/\s+\/\s+/), block=rowParts.length>1?rowParts[0]:'';
    let bounds=all, context=false;
    if(block) {
      let starts=matches(raw,block);
      const caseExact=starts.filter(m=>raw.slice(m.start,m.end).replace(/\s/g,'')===block.replace(/\s/g,''));
      if(caseExact.length===1)starts=caseExact;
      if(starts.length===1) {
        const start=starts[0].start, ends=headings.filter(h=>index(h).value!==index(block).value).flatMap(h=>matches(raw,h)).filter(m=>m.start>start).map(m=>m.start);
        bounds={start,end:ends.length?Math.min(...ends):raw.length}; context=true;
      }
    }
    if(anchor.scope==='outcome' && context)return {ranges:[bounds],status:'section',matchedText:raw.slice(bounds.start,bounds.end)};
    const quotes=matches(raw,anchor.sourceText,bounds);
    let quote=quotes.length===1?quotes[0]:null;
    if(quote) {bounds=quote;context=true;}
    if(anchor.scope==='outcome' && quote)return {ranges:[quote],status:'text',matchedText:raw.slice(quote.start,quote.end)};
    // Narrow a long quoted block to the named row before looking for values.
    const row=rowParts.at(-1);
    if(row && index(row).value.length>=5) {
      const rows=matches(raw,row,bounds);
      if(rows.length===1) {
        const start=rows[0].start;
        // A row ends at the next line/arm label when available. Repeated values
        // elsewhere in the quoted block must not be labelled as exact cells.
        const following=rowLabels.filter(label=>index(label).value!==index(row).value).flatMap(label=>matches(raw,label,{start:rows[0].end,end:bounds.end})).map(m=>m.start);
        bounds={start,end:following.length?Math.min(...following):bounds.end};context=true;
      }
    }
    const exact=matches(raw,anchor.valueText,bounds);
    if(context && exact.length===1)return {ranges:exact,status:'cell',matchedText:raw.slice(exact[0].start,exact[0].end)};
    const numeric=numericMatches(raw,anchor.valueText||'',bounds);
    if(context && numeric.length===1)return {ranges:numeric,status:'cell',matchedText:raw.slice(numeric[0].start,numeric[0].end)};
    if(context)return {ranges:[bounds],status:quote?'text':'row',matchedText:raw.slice(bounds.start,bounds.end)};
    // Never claim the location of a repeated bare number. Caption/page fallback
    // remains usable even when the extractor supplied a non-verbatim quote.
    const labels=matches(raw,anchor.label);
    return labels.length===1?{ranges:labels,status:'caption',matchedText:raw.slice(labels[0].start,labels[0].end)}:{ranges:[],status:'page',matchedText:''};
  }
  const validRect=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.00001&&r.y+r.height<=1.00001;
  function selectedRegion(anchor,current,saved=[]) {
    if(!anchor.selectionId)return null;
    return [current,...saved].find(s=>s?.selectionId===anchor.selectionId&&s.page===anchor.pdfPage&&validRect(s.normalizedRect)) || null;
  }
  const union=rects=>{const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));return {x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y};};
  const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  async function imageRegions(page) {
    const list=await page.getOperatorList(), ops=window.pdfjsLib.OPS, viewport=page.getViewport({scale:1}), stack=[], images=[];
    let transform=[1,0,0,1,0,0];
    for(let i=0;i<list.fnArray.length;i++) {
      const fn=list.fnArray[i], args=list.argsArray[i];
      if(fn===ops.save)stack.push([...transform]);
      else if(fn===ops.restore)transform=stack.pop()||[1,0,0,1,0,0];
      else if(fn===ops.transform)transform=multiply(transform,args);
      else if([ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject].includes(fn)) {
        const m=multiply(viewport.transform,transform), points=[[0,0],[0,1],[1,0],[1,1]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
        const x=Math.max(0,Math.min(...points.map(p=>p[0])))/viewport.width,y=Math.max(0,Math.min(...points.map(p=>p[1])))/viewport.height;
        const rect={x,y,width:Math.min(1-x,Math.max(...points.map(p=>p[0]))/viewport.width-x),height:Math.min(1-y,Math.max(...points.map(p=>p[1]))/viewport.height-y)};
        if(validRect(rect)&&rect.width*rect.height>.02)images.push(rect);
      }
    }
    return images;
  }
  function create({state,renderPage,rangeBoxes,clearHighlights,message,ensurePdf}) {
    let active=null, sequence=0, managedClear=false;
    const cache=new Map();
    const pdfMatches=a=>!!state.pdf && state.pdf.fingerprints?.[0]===a.pdfId && (!a.pdfFile||a.pdfFile===state.filename);
    const bar=(a,detail)=>message('evidence-message',`PDF p.${a.pdfPage}${a.label?' / '+a.label:''}${a.row?' / '+a.row:''}${a.column?' / '+a.column:''} — ${detail}`);
    function draw(a,pulse=true) {
      const host=document.getElementById(`pdf-page-${a.pdfPage}`);if(!host||!pdfMatches(a))return;
      host.querySelectorAll('.source-highlight').forEach(n=>n.remove());
      for(const rect of a.rects.filter(validRect)) {
        const node=document.createElement('div');node.className=`bbox-highlight source-highlight${a.sourceType==='figure'?' source-figure':''}${pulse?' source-pulse':''}`;
        node.dataset.sourceId=a.sourceId||'';node.dataset.resolution=a.resolutionStatus;
        Object.assign(node.style,{left:rect.x*100+'%',top:rect.y*100+'%',width:rect.width*100+'%',height:rect.height*100+'%'});host.append(node);
      }
    }
    async function resolveSourceAnchor(anchor,headings=[]) {
      if(!pdfMatches(anchor))throw Error('出典と現在のPDFが一致しません');
      const currentSelection=anchor.sourceType==='figure'?selectedRegion(anchor,window.DataExSelection?.getActiveSelection(),(window.dataexVisual?.snapshot()||[]).map(r=>r.source)):null;
      const key=JSON.stringify([anchor,headings,currentSelection?.normalizedRect||null]);
      if(cache.has(key))return structuredClone(cache.get(key));
      const data=await renderPage(anchor.pdfPage), result={...anchor,rects:[]};
      const found=resolveText(data.raw,anchor,headings);
      result.rects=found.ranges.flatMap(r=>rangeBoxes(data,{matchStart:r.start,matchEnd:r.end})).filter(validRect);
      result.resolutionStatus=found.status;result.matchedText=found.matchedText;
      if(anchor.sourceType==='figure') {
        if(currentSelection) {
          result.rects=[currentSelection.normalizedRect];result.resolutionStatus='selection';
        } else {
          const labels=matches(data.raw,anchor.label), captionRects=labels.length===1?rangeBoxes(data,{matchStart:labels[0].start,matchEnd:labels[0].end}):[];
          const figures=await imageRegions(data.page);
          // With more than one image require one unambiguous image near the caption.
          const caption=captionRects.length?union(captionRects):null;
          const nearby=caption?figures.filter(r=>r.y+r.height<=caption.y+.05&&caption.y-(r.y+r.height)<.18):[];
          const image=nearby.length===1?nearby[0]:figures.length===1&&caption?figures[0]:null;
          if(image) {result.rects=[image,...captionRects];result.resolutionStatus='figure';}
          else {result.rects=captionRects;result.resolutionStatus=captionRects.length?'caption':'page';}
        }
      }
      if(!result.rects.length)result.resolutionStatus='page';
      cache.set(key,structuredClone(result));return result;
    }
    async function navigateToSource(anchor,headings=[]) {
      if(!anchor)return {ok:false,resolutionStatus:'unresolved'};
      const request=++sequence;
      try {
        if(!pdfMatches(anchor)) {managedClear=true;try {await ensurePdf(anchor);} finally {managedClear=false;}}
        if(request!==sequence)return {ok:false,resolutionStatus:'cancelled'};
        if(!pdfMatches(anchor)) {bar(anchor,`${anchor.pdfFile||'対応PDF'}を選択してください`);return {ok:false,resolutionStatus:'wrong-pdf'};}
        if(!Number.isInteger(anchor.pdfPage)||anchor.pdfPage<1||anchor.pdfPage>state.pdf.numPages) {bar(anchor,'ページ番号を確認してください');return {ok:false,resolutionStatus:'invalid-page'};}
        const generation=state.generation;
        const resolved=await resolveSourceAnchor(anchor,headings);
        if(request!==sequence||generation!==state.generation)return {ok:false,resolutionStatus:'cancelled'};
        managedClear=true;try {clearHighlights();} finally {managedClear=false;}active=resolved;draw(active);
        state.currentPage=anchor.pdfPage;document.getElementById('page-number').value=anchor.pdfPage;
        const host=document.getElementById(`pdf-page-${anchor.pdfPage}`);
        (host.querySelector('.source-highlight')||host).scrollIntoView({block:host.querySelector('.source-highlight')?'center':'start',inline:'nearest'});
        const labels={cell:'値を特定',row:'行を表示（セル位置は未確定）',text:'原文を表示',section:'Outcomeのブロックを表示',selection:'選択した図領域を表示',figure:'図領域と図注を表示',caption:'図表注を表示（値の位置は未確定）',page:'ページを表示（位置は未確定）'};
        bar(anchor,labels[resolved.resolutionStatus]);
        const response={ok:true,...resolved};window.dispatchEvent(new CustomEvent('dataex-source-focus',{detail:response}));return response;
      } catch(error) {bar(anchor,'位置を確認できませんでした: '+error.message);return {ok:false,resolutionStatus:'unresolved',message:error.message};}
    }
    return {navigateToSource,resolveSourceAnchor,
      clear(){active=null;if(!managedClear)sequence++;},
      redraw(page){if(active?.pdfPage===page)draw(active,false);},
      async afterZoom(){if(active){draw(active,false);document.querySelector(`#pdf-page-${active.pdfPage} .source-highlight`)?.scrollIntoView({block:'center',inline:'nearest'});}},
      active:()=>active?structuredClone(active):null};
  }
  return Object.freeze({index,matches,numericMatches,resolveText,validRect,selectedRegion,create});
});
