// Regression-only subset transcribed from the saved RECOVERY Raw / Trace UI.
// Original effectMeasure labels intentionally remain HR/HR/RR/RR/RR.
// Never submitted to the live workspace; no new PDF extraction.
'use strict';
const cases=[
 ['mortality-all','Mortality at 28 days',.83,.75,.93,'HR','RATE_RATIO'],
 ['discharge','Discharged from hospital within 28 days',1.1,1.03,1.17,'HR','RATE_RATIO'],
 ['imv-or-death','Invasive mechanical ventilation or death',.92,.84,1.01,'RR','RISK_RATIO'],
 ['imv','Invasive mechanical ventilation',.77,.62,.95,'RR','RISK_RATIO'],
 ['mortality-no-baseline-imv','Death (subcomponent of invasive mechanical ventilation or death)',.93,.84,1.03,'RR','RISK_RATIO']
];
const footnote='Rate ratios have been adjusted for age with respect to the outcomes of 28-day mortality and hospital discharge. Risk ra- tios have been adjusted for age with respect to the outcome of receipt of invasive mechanical ventilation or death and its subcomponents.';
function fixture(){
 const file='05_RECOVERY_2020_Dexamethasone_COVID19.pdf';
 const source=(id,row,column,evidenceText)=>({id,pdfFile:file,pdfPage:9,printedPage:'9',section:'Primary and Secondary Outcomes',tableFigure:'Table 2',row,column,evidenceText,directValue:evidenceText,kind:'TABLE',selectionId:null});
 const rawValues=cases.map(([id,name,estimate,ciLow,ciHigh,effectMeasure],i)=>({id:'raw-'+id+'-effect',outcomeId:id,armId:'DEX',comparatorArmId:'UC',confidence:.99,effectMeasure,nBasis:'NOT_APPLICABLE',resultType:'effect',timepoint:'28 days',statistics:{ciHigh,ciLevel:95,ciLow,estimate},sourceRefs:{ciHigh:'t2-'+id+'-effect',ciLevel:'rec-table2-ci',ciLow:'t2-'+id+'-effect',estimate:'t2-'+id+'-effect'},population:i<2?'All randomized participants; intention-to-treat':'Randomized participants not receiving invasive mechanical ventilation at baseline; intention-to-treat subgroup',adjustment:'Age-adjusted (<70, 70–79, ≥80); comparison direction Dexamethasone / Usual care. '+(i===0?'Cox hazard ratio reported as mortality rate ratio.':i===1?'Cox discharge rate ratio; deaths censored at day 29.':'Log-binomial risk ratio; not a Cox hazard ratio.')}));
 return {requestId:'db7a3551-d5d4-4626-8bb7-b822a9fab3fe',pdfId:'3a5f809c67f841fc8f907945362e7635',study:{label:'RECOVERY 2020 — saved Table 2 regression subset',design:'Open-label randomized controlled platform trial',analysisUnit:'participant',followUp:'28 days',sourceIds:['rec-cox'],arms:[{id:'DEX',label:'Dexamethasone',role:'intervention',randomizedN:2104,sourceIds:[]},{id:'UC',label:'Usual care',role:'comparator',randomizedN:4321,sourceIds:[]}]},outcomes:cases.map(([id,reportedName])=>({id,reportedName,conceptCandidate:reportedName,dataType:'binary',instrument:null,scale:{min:null,max:null,unit:null,direction:'Reported direction retained'},timepoints:['28 days'],resultType:'mixed',confidence:.99,mapping:{target:null,relation:'DISCOVERED',reason:'Saved Paper-only result'}})),rawValues,sources:[
  source('rec-table2-ci','All outcomes','Rate or Risk Ratio (95% CI)',footnote),
  ...cases.map(([id,name,estimate,lo,hi])=>source('t2-'+id+'-effect',name,'Rate or Risk Ratio (95% CI)',`${name} ${estimate} (${lo}–${hi})`)),
  {...source('rec-cox','Statistical analysis','Methods','For the primary outcome of 28-day mortality, the hazard ratio from Cox regression was used to estimate the mortality rate ratio. Cox regression was used to analyze the secondary outcome of hospital discharge within 28 days, with censoring of data on day 29 for patients who had died during hospitalization.'),tableFigure:null,pdfPage:3,kind:'TEXT'}
 ],proposals:[],limitations:[]};
}
module.exports={fixture:()=>{const raw=fixture();raw.study.arms.forEach(arm=>Object.assign(arm,{treatedN:null,analyzedN:null,safetyN:null}));return raw;},cases,footnote};
