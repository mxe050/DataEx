/* Saved numeric checkpoint projection for tests only. No PDF parsing or extraction. */
const saved=require('./dataex-ukbeam-checkpoint.json');
function fixture(){
 const raw={pdfId:saved.pdfId,requestId:saved.requestId,study:{label:saved.study,design:'3 × 2 factorial trial; six original randomized groups; four reported clinical groups',analysisUnit:'Individual participant',followUp:'3 and 12 months',sourceIds:['structure'],arms:saved.arms.map(([id,label,randomizedN],i)=>({id,label,randomizedN,treatedN:null,analyzedN:null,safetyN:null,sourceIds:['structure'],role:i===8?'STUDY_TOTAL: descriptive aggregate':i===6?'REPORTED_POOLED_ARM: A3+A4; not an additional independent arm':i===7?'REPORTED_POOLED_ARM: A5+A6; not an additional independent arm':i===0?'COMPARATOR: original randomised arm':'INTERVENTION: original randomised arm'}))},outcomes:saved.outcomes.map(([id,reportedName])=>({id,reportedName,conceptCandidate:reportedName,instrument:reportedName,dataType:['O11','O13','O14','O16','O17'].includes(id)?'binary':'continuous',scale:{min:0,max:id==='O1'?24:100,unit:'points',direction:['O4','O6','O7'].includes(id)?'higher is better':'lower is better'},confidence:.98,mapping:{target:null,relation:'DISCOVERED',reason:id==='O1'?'primary outcome':'Reported outcome'},timepoints:['Baseline','3 months','12 months'],resultType:'endpoint'})),sources:[],rawValues:[],proposals:[],limitations:saved.importantLimitations};
 function source(id,tableFigure,pdfPage,row,column){if(!raw.sources.some(s=>s.id===id))raw.sources.push({id,pdfFile:saved.pdf,pdfPage,printedPage:String(pdfPage-1),section:'Results',tableFigure,row,column,directValue:'Numeric checkpoint',evidenceText:'Saved numeric checkpoint projection; not a verbatim quote.',kind:'TABLE',selectionId:null});return id;}
 source('structure','Table 1',5,'Six original arms','Original randomized arms / study total');
 function add(outcomeId,armId,timepoint,resultType,statistics,src,extra={}){const r={id:'r'+(raw.rawValues.length+1),outcomeId,armId,comparatorArmId:null,timepoint,population:'ITT',nBasis:'OUTCOME_ANALYZED',resultType,statistics,sourceRefs:Object.fromEntries(Object.keys(statistics).map(k=>[k,src])),effectMeasure:null,adjustment:null,confidence:.98,...extra};raw.rawValues.push(r);return r;}
 for(const [o,rows]of Object.entries(saved.baselineContinuous))for(const [a,mean,sd]of rows)add(o,a,'Baseline','baseline',{mean,sd},'structure',{nBasis:'UNKNOWN'});
 for(const [o,rows]of Object.entries(saved.baselineBinary))for(const [a,events,total]of rows)add(o,a,'Baseline','baseline',{events,total},'structure');
 for(const [table,outcomes]of Object.entries(saved.adjustedTables))for(const [o,times]of Object.entries(outcomes))times.forEach((v,i)=>{
  const a={'Table 2':'A2','Table 3':'A7','Table 4':'A8'}[table],time=i?'12 months':'3 months',sid=source(table+'-'+o,table,table==='Table 4'?7:6,raw.outcomes.find(x=>x.id===o).reportedName,'Net benefit (95% CI)');
  add(o,'A1',time,'endpoint',{mean:v[0],se:v[1],n:v[2]},sid,{adjustment:'ANCOVA; adjusted SE'});add(o,a,time,'endpoint',{mean:v[3],se:v[4],n:v[5]},sid,{adjustment:'ANCOVA; adjusted SE'});
  add(o,a,time,'effect',{estimate:v[6],ciLow:v[7],ciHigh:v[8],ciLevel:95},sid,{comparatorArmId:'A1',nBasis:'NOT_APPLICABLE',effectMeasure:'adjusted mean difference',adjustment:'ANCOVA '+(['O4','O6','O7'].includes(o)?'Intervention minus Control':'Control minus Intervention')});
 });
 for(const [time,mean,sd]of saved.overallRolandChange)add('O1','A9',time,'change',{mean,sd},'structure',{nBasis:'UNKNOWN'});
 for(const [a,time,estimate,ciLow,ciHigh,ciLevel]of saved.multilevelRoland)add('O1',a,time,'effect',{estimate,ciLow,ciHigh,ciLevel},source('multilevel',null,4,'Sensitivity analysis','Control minus Intervention'),{comparatorArmId:'A1',effectMeasure:'adjusted mean difference',adjustment:'Multilevel; Control minus Intervention',nBasis:'NOT_APPLICABLE'});
 for(const [time,estimate,ciLow,ciHigh,ciLevel]of saved.RolandInteraction)add('O1',null,time,'effect',{estimate,ciLow,ciHigh,ciLevel},'structure',{effectMeasure:'Interaction coefficient',nBasis:'NOT_APPLICABLE'});
 for(const [time,estimate,ciLow,ciHigh,direction]of saved.premisesRoland)add('O1',null,time,'effect',{estimate,ciLow,ciHigh},'structure',{adjustment:direction,effectMeasure:'Setting comparison',nBasis:'NOT_APPLICABLE'});
 for(const [a,time,estimate]of saved.standardisedRolandDifference)add('O1',a,time,'effect',{estimate},'structure',{comparatorArmId:'A1',effectMeasure:'standardised difference',nBasis:'NOT_APPLICABLE'});
 add('O11','A9',saved.SAE.time,'event',{events:0,total:null},'structure',{nBasis:'UNKNOWN'});
 for(const [a,total,n3,n12]of saved.questionnaireReturns){add('O16',a,'3 months','event',{events:n3,total},'structure');add('O16',a,'12 months','event',{events:n12,total},'structure');}
 for(const [population,events,total]of saved.minimumTreatment)add('O17',null,'Treatment period','event',{events,total},'structure',{population});
 return raw;
}
module.exports={fixture,saved};
