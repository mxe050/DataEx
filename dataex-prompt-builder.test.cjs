const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const builder = require('./dataex-prompt-builder.js');
const core = require('./dataex-core-prompt.js');
const test = (name, run) => { run(); console.log('PASS ' + name); };
const review = {studyDesign:'parallel-rct', intervention:'Active therapy', comparator:'Usual care',
  outcomes:'Pain intensity\r\n\r\nQuality of life\nAdverse events\n', timepoint:'8–12 weeks', analysisUnit:'participant',
  nodeRule:'Keep dose groups separate', populationRule:'ITT', dataType:'continuous', requestedStatistics:['mean','SD','SE','n'],
  scale:'0–100', timeOrigin:'randomization', timeSelectionRule:'latest eligible', extraRules:'Use raw arm values'};
test('Core v0.9 is byte-for-byte identical as text to the checked-in original; independent versions', () => {
  assert.equal(core.CORE_PROMPT_TEMPLATE, fs.readFileSync(path.join(__dirname,'prompts/SR_Extraction_CORE_PROMPT_v0_9.txt'),'utf8'));
  assert.equal(core.CORE_PROMPT_VERSION,'0.9'); assert.equal(builder.BUILDER_VERSION,'1.0.0'); assert.ok(Object.isFrozen(core));
});
test('All original core sections and final paragraph survive interpolation without truncation', () => {
  const prompt = builder.generate(review).prompt;
  assert.ok(prompt.length > core.CORE_PROMPT_TEMPLATE.length);
  for (const section of core.CORE_PROMPT_TEMPLATE.match(/^# \d+\..+$/gm)) assert.ok(prompt.includes(section), section);
  assert.ok(prompt.endsWith(core.CORE_PROMPT_TEMPLATE.split('# 21.')[1])); assert.doesNotMatch(prompt,/\{\{[A-Z_]+\}\}/);
});
test('Intervention and Comparator appear in their own review sections', () => {
  const {prompt} = builder.generate(review); assert.match(prompt,/## 介入\nActive therapy/); assert.match(prompt,/## 比較\nUsual care/);
});
test('CRLF and blank lines yield ordered O1/O2/O3 with all three names', () => {
  assert.deepEqual(builder.configuration(review).outcomes.map(o => [o.id,o.name]),[['O1','Pain intensity'],['O2','Quality of life'],['O3','Adverse events']]);
});
test('Each outcome inherits timepoint, data type, statistics, denominator, scale and time rules', () => {
  for (const o of builder.configuration(review).outcomes) for (const key of ['timepoint','analysisUnit','dataType','requestedStatistics','populationRule','scale','timeOrigin','timeSelectionRule','extraRules']) assert.deepEqual(o[key],review[key]);
});
test('Future outcome overrides preserve binary and time-to-event statistics independently', () => {
  const c = builder.configuration({...review,outcomes:[{name:'Pain'},{name:'AE',dataType:'binary',requestedStatistics:['events','total'],scale:''},{name:'Survival',dataType:'time-to-event',requestedStatistics:['HR','95% CI'],timepoint:'5 years'}]});
  assert.deepEqual(c.outcomes[1].requestedStatistics,['events','total']); assert.equal(c.outcomes[1].scale,'');
  assert.deepEqual(c.outcomes[2].requestedStatistics,['HR','95% CI']); assert.equal(c.outcomes[2].timepoint,'5 years');
  c.outcomes[0].requestedStatistics.push('test'); assert.ok(!c.requestedStatistics.includes('test')); assert.ok(!c.outcomes[1].requestedStatistics.includes('test'));
});
test('All six data types and eight study designs are supported; case-control cannot be selected', () => {
  assert.equal(builder.DATA_TYPES.length,6); assert.equal(builder.STUDY_DESIGNS.length,8);
  assert.doesNotMatch(JSON.stringify(builder.STUDY_DESIGNS),/case.?control|ケースコントロール/i);
  assert.equal(builder.configuration({...review,studyDesign:'case-control'}).studyDesign,'auto');
  for (const type of builder.DATA_TYPES) assert.equal(builder.generate({...review,dataType:type,requestedStatistics:builder.STATISTICS[type]}).configuration.dataType,type);
});
test('Time origin and time selection rule remain unspecified unless supplied', () => {
  const c = builder.configuration({outcomes:'Pain intensity'}); assert.equal(c.timeOrigin,''); assert.equal(c.timeSelectionRule,''); assert.equal(c.dataType,'');
});
test('Minimal and empty specifications still generate a complete prompt with nonblocking warnings', () => {
  for (const input of [{outcomes:'Pain intensity'},{}]) {const result=builder.generate(input);assert.ok(result.prompt.includes('# 21.'));assert.ok(result.warnings.length);}
});
test('Explicit timing and scale in an outcome name do not produce duplicate missing-setting warnings', () => {
  const c=builder.configuration({...review,timepoint:'',scale:'',outcomes:'BCVA (ETDRS letters) at 12 weeks'}); assert.deepEqual(builder.warnings(c),[]);
});
test('Binary outcomes need no continuous scale; exact denominator wording is retained', () => {
  const c=builder.configuration({...review,dataType:'binary',scale:'',populationRule:'Safety set / row-specific n'});
  assert.deepEqual(builder.warnings(c),[]); assert.equal(c.outcomes[0].populationRule,'Safety set / row-specific n');
});
test('Template-looking user input, dollar replacements and HTML stay literal and are never executed', () => {
  const value='$& $` ${secret} {{COMPARATOR}} <img src=x onerror=alert(1)>';
  const result=builder.generate({...review,intervention:value});assert.ok(result.prompt.includes('## 介入\n'+value));assert.match(result.prompt,/## 比較\nUsual care/);
});
test('Long permitted text is not clipped or silently reduced to one outcome', () => {
  const name='長いアウトカム'.repeat(800); const result=builder.generate({...review,outcomes:[name,'Second']});
  assert.ok(result.prompt.includes(name)); assert.equal(result.configuration.outcomes.length,2);
});
test('Export only contains configuration and version metadata, excluding template, API and PDF fields', () => {
  const data=builder.exportConfiguration({...review,apiKey:'secret',prompt:core.CORE_PROMPT_TEMPLATE,pdf:{bytes:'secret'},selectedRegion:{page:5}});
  assert.equal(data.builderVersion,'1.0.0');assert.equal(data.corePromptVersion,'0.9');
  assert.deepEqual(Object.keys(data.reviewConfiguration).sort(),['studyDesign','intervention','comparator','outcomes','timepoint','analysisUnit','nodeRule','populationRule','dataType','requestedStatistics','scale','timeOrigin','timeSelectionRule','extraRules'].sort());
  assert.doesNotMatch(JSON.stringify(data),/secret|CORE_PROMPT_TEMPLATE|selectedRegion|pdfBytes/);
});
test('Existing source trace requirements for file, page, printed page, table, row, column and value remain in core', () => {
  const prompt=builder.generate(review).prompt;for(const label of ['**PDF**','**PDF page**','**Printed page**','**Section**','**Table/Figure**','**Row**','**Column/Arm**','**Direct value**'])assert.ok(prompt.includes(label),label);
});
test('Regeneration uses the current configuration without rewriting the immutable core', () => {
  const before=core.CORE_PROMPT_TEMPLATE; builder.generate(review);const next=builder.generate({...review,intervention:'New treatment'});
  assert.match(next.prompt,/## 介入\nNew treatment/);assert.equal(core.CORE_PROMPT_TEMPLATE,before);
});
