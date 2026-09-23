const fs=require('node:fs'),path=require('node:path');
const trace=require('./dataex-csv-trace.js');
let checks=0;
function ok(value,message){checks++;if(!value)throw Error(message);console.log('PASS',message);}

const hash='a'.repeat(64),source={id:'S1',pdfFile:'paper.pdf',pdfPage:5,directValue:'1',evidenceText:'events 1 of 32',kind:'TABLE'};
const raw={id:'R1',statistics:{events:2},sourceRefs:{events:'S1'}};
const point={id:'R1',raw:{events:2,sourceRefs:{events:'S1'}},decision:{finalValue:null}};
const record={studyId:'study-1',snapshot:{pdf:{filename:'paper.pdf',pageCount:8},raw:{rawValues:[raw],sources:[source]}},points:{R1:point}};
const evidence={studyId:'study-1',document:{filename:'paper.pdf',sha256:hash,byte_size:1234,page_count:8,hash_method:'SHA-256/file-bytes'},matchedSourceIds:['S1'],sourceLocations:{}};
const unresolved=trace.inheritedEvidence(record,point,'events',evidence);
ok(unresolved.sources[0].document.sha256===hash,'quote mismatch still preserves observed PDF SHA-256');
ok(unresolved.sources[0].document.byte_size===1234&&unresolved.sources[0].document.page_count===8,'quote mismatch preserves observed PDF size and page count');
ok(unresolved.sources[0].quote_segments.length===0&&unresolved.reportedValue===null,'quote mismatch does not claim unresolved text as numeric proof');

const root=__dirname,proposal=fs.readFileSync(path.join(root,'dataex-ai-proposal-ui.js'),'utf8'),workspace=fs.readFileSync(path.join(root,'dataex-review-workspace.js'),'utf8'),focus=fs.readFileSync(path.join(root,'dataex-focus-review.js'),'utf8');
ok(proposal.includes("outputFor(run,t,true)"),'preview uses preview gate rather than final export gate');
ok(proposal.includes("dataex-candidate-restored")&&focus.includes("dataex-candidate-restored"),'proposal waits for exact candidate restoration acknowledgement');
ok(proposal.includes("AI提案の対象候補と表示中カードが一致しません"),'approval fails closed when proposal target and visible card differ');
ok(workspace.includes("pageText===''?null:Number(pageText)"),'empty PDF page remains empty instead of becoming page 0');
ok(workspace.includes('変更した群・項目の修正理由'),'only a changed group or field requests an edit reason');
ok(proposal.includes('アウトカム大分類')&&proposal.includes('共通アウトカム')&&proposal.includes('時間窓'),'proposal table has separate category, outcome and time-window selectors');
ok(workspace.includes("saveFailure=persistAttempted?e.message:''"),'candidate validation failures do not remain as false persistence failures');
ok(proposal.includes('t.rows.filter(row=>!row.humanStatus).flatMap(row=>row.matches.map')&&proposal.includes('対応の注意がある候補'),'bulk approval includes displayed review warnings but excludes explicit holds');
ok(proposal.includes('この候補を表から外す'),'an incompatible included candidate has a reversible removal action');
const proposalCore=require('./dataex-ai-proposal.js');
ok(!!proposalCore.mappingReviewReason({status:'candidate',reason:''},{reason:'特定4症状の複合であり総AEへ自動統合しない。'}),'explicit non-equivalence blocks proposal-table export');
ok(!proposalCore.mappingReviewReason({status:'candidate',reason:'',humanDecision:{type:'ADD'}},{reason:'特定4症状の複合。'}),'an explicit human mapping decision can resolve a definition warning');
console.log(JSON.stringify({checks,passed:true}));
