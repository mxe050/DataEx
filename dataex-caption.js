/* Same-page caption association. PDF text is untrusted evidence, never instructions.
 * No OCR, network access, cross-page search or numeric extraction. */
'use strict';
window.DataExCaptions=(()=>{
  const MAX_TEXT=900,MAX_TOTAL=990,MAX_GAP=.08,MIN_SCORE=.84;
  const start=/^(Figure|Fig\.?|Table)\s+((?:S?\d+|[IVX]+)[a-z]?)(?=[\s.:]|$)\s*[.:]?\s*/i;
  const refVerb=/^(?:shows?|illustrates?|depicts?|presents?|summari[sz]es?|demonstrates?|was|were|is|are|and|or|に|は)\b/i;
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
  const box=items=>{const x=Math.min(...items.map(i=>i.x)),y=Math.min(...items.map(i=>i.y));return{x,y,width:Math.max(...items.map(i=>i.x+i.width))-x,height:Math.max(...items.map(i=>i.y+i.height))-y};};
  const hash=text=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(16);};
  const selectionSource=s=>({sourceId:'visual-'+s.selectionId,page:s.page,selectionId:s.selectionId,normalizedRect:structuredClone(s.normalizedRect),sourceType:'VISUAL_REGION'});
  function pageItems(data){
    const viewport=data.page.getViewport({scale:1}),v=viewport.transform;
    return data.textContent.items.filter(i=>typeof i.str==='string').flatMap((i,index)=>{
      if(!i.str.trim()||!i.transform||!i.width)return[];
      const t=i.transform,a=v[0]*t[0]+v[2]*t[1],b=v[1]*t[0]+v[3]*t[1];
      // Vertical/rotated text cannot be treated as a horizontal caption block.
      if(Math.abs(Math.atan2(b,a))>.04)return[];
      const height=Math.hypot(v[0]*t[2]+v[2]*t[3],v[1]*t[2]+v[3]*t[3]);
      const x=v[0]*t[4]+v[2]*t[5]+v[4],baseline=v[1]*t[4]+v[3]*t[5]+v[5];
      const style=data.textContent.styles?.[i.fontName]||{},ascent=style.ascent??(style.descent!=null?1+style.descent:.8);
      return[{text:i.str,index,x:x/viewport.width,y:(baseline-height*ascent)/viewport.height,width:i.width*viewport.scale/viewport.width,height:height/viewport.height,baseline:baseline/viewport.height}];
    }).filter(i=>i.height>0&&i.height<.06&&i.x>=0&&i.y>=0&&i.x+i.width<1.01&&i.y+i.height<1.01);
  }
  function linesFrom(items){
    const rows=[];
    for(const item of [...items].sort((a,b)=>(a.baseline??a.y+a.height)-(b.baseline??b.y+b.height)||a.x-b.x)){
      const baseline=item.baseline??item.y+item.height;
      const row=rows.findLast(r=>Math.abs(r.baseline-baseline)<=Math.max(r.height,item.height)*.3);
      if(row){row.items.push(item);row.height=Math.max(row.height,item.height);}else rows.push({baseline,height:item.height,items:[item]});
    }
    const lines=[];
    for(const row of rows){let segment=[];
      const flush=()=>{if(segment.length){lines.push({...box(segment),text:segment.map(i=>i.text.trim()).join(' '),items:segment});segment=[];}};
      for(const item of row.items.sort((a,b)=>a.x-b.x)){const prev=segment.at(-1);if(prev&&item.x-(prev.x+prev.width)>.03)flush();segment.push(item);}flush();
    }
    return lines.sort((a,b)=>a.y-b.y||a.x-b.x);
  }
  function detectItems(items,s){
    const empty={selectionSource:selectionSource(s),nearbyMetadataSources:[],captionStatus:'NOT_FOUND',captionReason:'同一ページの近傍に確実なcaptionが見つかりませんでした。'};
    if(!items.length||items.length>20000)return empty;
    const lines=linesFrom(items),starts=lines.map((line,index)=>({line,index,match:line.text.match(start)})).filter(c=>c.match&&!refVerb.test(c.line.text.slice(c.match[0].length)));
    const candidates=[];
    for(const c of starts){
      const kind=/^table$/i.test(c.match[1])?'TABLE_CAPTION':'FIGURE_CAPTION',number=c.match[2],name=(kind==='TABLE_CAPTION'?'Table ':'Figure ')+number;
      const block=[c.line];let text=c.line.text,truncated=false;
      for(let n=c.index+1;n<lines.length&&block.length<7;n++){
        const line=lines[n],last=block.at(-1);
        if(line.y<=last.y+last.height*.4)continue;
        if(line.y-(last.y+last.height)>Math.max(.006,last.height*.8))break;
        if(Math.abs(line.x-c.line.x)>.025||line.x+line.width>c.line.x+Math.max(c.line.width,.18)+.04)continue;
        if(start.test(line.text)||/^\d{1,5}$/.test(line.text.trim())||/^(?:Results|Discussion|Methods|Introduction|References|Patients with|Mean change|LS mean)\b/i.test(line.text))break;
        if(text.length+line.text.length+1>MAX_TEXT){truncated=true;break;}
        block.push(line);text+=' '+line.text;
      }
      if(text.length>MAX_TEXT){text=text.slice(0,MAX_TEXT);truncated=true;}
      const rect=box(block),r=s.normalizedRect,horizontal=overlap(rect,r)/Math.min(rect.width,r.width);
      if(horizontal<.7)continue;
      const below=rect.y-(r.y+r.height),above=r.y-(rect.y+rect.height);
      let direction,distance,edge;
      if(below>=-.006){direction='BELOW';distance=Math.max(0,below);edge=kind==='FIGURE_CAPTION';}
      else if(above>=-.006){direction='ABOVE';distance=Math.max(0,above);edge=kind==='TABLE_CAPTION';}
      else{
        const position=(c.line.y-r.y)/r.height;
        direction='INSIDE';distance=0;edge=kind==='FIGURE_CAPTION'?position>=.65:position<=.25&&position>=-.02;
        if(!edge)continue;
      }
      if(distance>MAX_GAP)continue;
      const unique=starts.filter(x=>(/^table$/i.test(x.match[1])?'Table ':'Figure ')+x.match[2]===name).length===1;
      const confidence=Math.min(1,.36+.22*horizontal+.14*(1-distance/MAX_GAP)+(edge?.18:.07)+(unique?.1:0));
      const itemIndices=[...new Set(block.flatMap(l=>l.items.map(i=>i.index)).filter(Number.isInteger))];
      candidates.push({sourceId:`caption-${s.page}-${hash(name+'|'+text+'|'+rect.x+'|'+rect.y)}`,page:s.page,sourceType:'PDF_TEXT_CAPTION',type:kind,label:name+(kind==='FIGURE_CAPTION'?' caption':' title'),number:name,text,focusQuery:c.line.text.slice(0,150),distance,confidence:Number(confidence.toFixed(3)),direction,normalizedRect:rect,itemIndices,lineRects:block.map(l=>({x:l.x,y:l.y,width:l.width,height:l.height})),verification:'SOURCE_VERIFIED_TEXT',unique,truncated});
    }
    candidates.sort((a,b)=>b.confidence-a.confidence||a.distance-b.distance);
    if(!candidates.length)return empty;
    // A nearest neighbour alone is insufficient: a caption anchor, horizontal
    // corridor, bounded vertical gap and unique number must all agree. Multiple
    // plausible captions are deliberately left for review, even at different distances.
    const matched=candidates.length===1&&candidates[0].unique&&candidates[0].confidence>=MIN_SCORE;
    const chosen=candidates.slice(0,matched?1:3);let budget=MAX_TOTAL;
    const sources=chosen.map((c,i)=>{const allowance=Math.floor(budget/(chosen.length-i));const text=c.text.slice(0,allowance);budget-=text.length;return{...c,text,truncated:c.truncated||text.length<c.text.length};});
    return {...empty,nearbyMetadataSources:sources,captionStatus:matched?'MATCHED':'AMBIGUOUS',captionReason:matched?'番号付きcaptionと選択範囲の縦方向位置・横方向の重なりが一致しました。':'複数候補・番号の重複・位置の不確実性があるため、自動補足しません。'};
  }
  return {detect:(data,s)=>detectItems(pageItems(data),s),detectItems,selectionSource};
})();
