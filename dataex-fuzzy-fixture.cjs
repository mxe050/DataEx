// Synthetic, explicitly labelled integration data; never an extraction from a real paper.
function fixture(pdfId='fixture-pdf', filename='fuzzy-fixture.pdf') {
  const arms=['Individualized acupuncture','Standardized acupuncture','Simulated acupuncture','Usual care'].map((label,i)=>({id:'A'+(i+1),label,role:i===3?'comparator':i===2?'sham':'intervention',randomizedN:60,treatedN:59,analyzedN:40,safetyN:58,sourceIds:['structure']}));
  const source=(id,line,row='Outcome row',column='Original arm')=>({id,pdfFile:filename,pdfPage:1,printedPage:'1',section:'Results',tableFigure:'Table 1',row,column,directValue:line,evidenceText:line,kind:'TABLE',selectionId:null});
  const outcomes=[['O1','VAS pain intensity','Pain intensity',0,10,'VAS','continuous'],['O2','NRS pain intensity','Pain intensity',0,100,'NRS','continuous'],['O3','Roland disability score','Disability',0,23,'Roland','continuous'],['O4','Pressure pain threshold','Pressure pain threshold',null,null,'Algometer','continuous'],['O5','Participants with adverse events','Safety',null,null,null,'binary']].map(([id,reportedName,conceptCandidate,min,max,instrument,dataType])=>({id,reportedName,conceptCandidate,dataType,instrument,scale:{min,max,unit:id==='O4'?'kPa':dataType==='binary'?'participants':'points',direction:'higher is worse'},timepoints:id==='O1'?['8 weeks','12 weeks']:['8 weeks'],resultType:dataType==='binary'?'event':'endpoint',confidence:.95,mapping:{target:null,relation:'DISCOVERED',reason:'Reported original measure'}}));
  const structure='SYNTHETIC FIXTURE. Four-arm parallel RCT. Randomized 60, treated 59, analyzed 40, safety 58 per arm.';
  const sources=[source('structure',structure,'Study structure','All four arms')],rawValues=[];
  const add=(outcomeId,armId,timepoint,statistics)=>{
    const id='R'+(rawValues.length+1),s='source-'+id;
    const line=[id,outcomes.find(o=>o.id===outcomeId).reportedName,armId,timepoint,...Object.entries(statistics).map(([k,v])=>`${k} ${v}`)].join(' | ');
    sources.push(source(s,line,timepoint,armId));
    rawValues.push({id,outcomeId,armId,comparatorArmId:null,timepoint,population:'Observed participants at this timepoint',nBasis:'OUTCOME_ANALYZED',resultType:outcomeId==='O5'?'event':'endpoint',statistics,sourceRefs:Object.fromEntries(Object.keys(statistics).map(k=>[k,s])),effectMeasure:null,adjustment:null,confidence:.95});
  };
  for(const [i,a]of arms.entries())for(const time of ['8 weeks','12 weeks'])add('O1',a.id,time,{n:40,mean:3+i,...(i===0&&time==='12 weeks'?{se:.4}:{sd:2})});
  add('O2','A1','8 weeks',{n:40,mean:30,sd:20});add('O3','A1','8 weeks',{n:40,mean:8,sd:3});add('O4','A1','8 weeks',{n:40,mean:120,sd:25});add('O5','A1','8 weeks',{events:0,total:58});
  rawValues.at(-1).nBasis='SAFETY';rawValues.at(-1).population='Safety set';
  return {requestId:'fixture-request',pdfId,study:{label:'Synthetic Fuzzy acceptance fixture',design:'parallel RCT',analysisUnit:'participant',followUp:'8 and 12 weeks',arms,sourceIds:['structure']},sources,outcomes,rawValues,
    proposals:[{id:'P1',kind:'ARM_COMBINATION',label:'Individualized + Standardized: Real acupuncture',reason:'Two active acupuncture arms; simulated acupuncture remains a separate sham arm. Do not reuse usual care as independent comparisons.',armIds:['A1','A2'],outcomeIds:['O1'],timepoints:[],confidence:.9},
      {id:'P2',kind:'TIME_CLUSTER',label:'8 and 12 weeks: short-term candidates',reason:'Keep both until a representative timepoint is reviewed.',armIds:[],outcomeIds:['O1'],timepoints:['8 weeks','12 weeks'],confidence:.8}],limitations:[]};
}
module.exports={fixture};
