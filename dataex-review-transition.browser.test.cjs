// Deterministic transition races in a fresh browser with in-memory dependencies.
// Does not navigate to DataEx or read/write the user's IndexedDB/localStorage.
const { chromium } = require(process.env.DATAEX_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.setContent('<!doctype html><div class="fuzzy-intro"></div><section id="results-section"></section>');
    await page.evaluate(() => {
      const projects = ['A', 'B', 'C'].map(id => ({ id, label: id, context: { reviewName: id, outcomes: [] } }));
      const records = new Map(), gates = new Map();
      let active = 'A';
      window.testGate = key => {
        let enter, release;
        const entered = new Promise(resolve => { enter = resolve; });
        const blocked = new Promise(resolve => { release = resolve; });
        gates.set(key, async () => { gates.delete(key); enter(); await blocked; });
        return { entered, release };
      };
      const waitGate = key => gates.get(key)?.();
      window.testActivate = project => waitGate('activate:' + project.id);
      window.DataExReviewProjects = {
        all: async () => structuredClone(projects),
        active: async () => active,
        setActive: async id => { active = id; return id; },
        get: async id => structuredClone(projects.find(project => project.id === id) || null),
        saveContext: async () => {},
        ensure: async project => { await waitGate('ensure:' + project.id); return project; },
        create: async label => { const project = { id: label, label, context: { reviewName: label, outcomes: [] } }; projects.push(project); active = label; return structuredClone(project); }
      };
      window.DataExReviewStore = {
        all: async () => structuredClone([...records.values()]),
        get: async id => structuredClone(records.get(id) || null),
        put: async record => { records.set(record.id, structuredClone(record)); }
      };
      window.DataExDecision = {
        projectFor: context => ({ id: context.reviewName, label: context.reviewName }),
        keyFor: (study, project) => project.id + ':' + study.raw.requestId,
        make: (study, project) => ({ id: project.id + ':' + study.raw.requestId, project, snapshot: study, extractionId: study.raw.requestId, studyId: study.raw.pdfId, updatedAt: '2026-09-11', revision: 0 }),
        assertRecord: () => {}, basket: () => [], basketConflicts: () => [], counts: () => ({ confirmed: 0, hold: 0 })
      };
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'dataex-review-workspace.js'), 'utf8') });
    const passed = await page.evaluate(async () => {
      const checks = [];
      const tick = () => new Promise(resolve => setTimeout(resolve, 0));
      function check(condition, label) { if (!condition) throw new Error(label); checks.push(label); }
      const api = window.createDataExReview({
        getContext: () => ({ reviewName: 'A', outcomes: [] }),
        onProjectChange: project => window.testActivate(project),
        openSaved: async record => api.bind(record.snapshot, record.snapshot.extractionContext, false, record.project)
      });
      function bind(id, requestId) {
        api.bind({ raw: { requestId, pdfId: 'pdf', study: { label: 'Synthetic study ' + id } }, pdf: { filename: 'fixture.pdf' } },
          { reviewName: id, outcomes: [] }, true, { id, label: id });
      }
      await api.whenIdle();

      // Previously a delayed bind(A) changed saved selection back to A after B completed.
      const oldBind = window.testGate('ensure:A');
      bind('A', 'request-1');
      await oldBind.entered;
      let switched = false, idle = false;
      const switching = api.selectProject('B').then(() => { switched = true; });
      const waiting = api.whenIdle().then(() => { idle = true; });
      await tick();
      check(!switched && !idle, 'Switch and whenIdle wait for a pending bind');
      oldBind.release();
      await Promise.all([switching, waiting]);
      check(api.selectedProject().id === 'B' && await DataExReviewProjects.active() === 'B', 'Delayed old bind cannot overwrite the newly selected review');

      const activation = window.testGate('activate:C');
      const moving = api.selectProject('C');
      await activation.entered;
      let transitionIdle = false;
      const waitTransition = api.whenIdle().then(() => { transitionIdle = true; });
      await tick();
      check(!transitionIdle, 'whenIdle waits for the entire review transition');
      check(document.querySelector('#review-workspace select').disabled, 'Re-rendered review selector stays disabled during a transition');
      const overlap = await Promise.allSettled([api.selectProject('A'), api.createProject('D')]);
      check(overlap.every(result => result.status === 'rejected' && /切り替えています/.test(result.reason.message)), 'Overlapping selection and creation are rejected');
      check(!(await DataExReviewProjects.all()).some(project => project.id === 'D'), 'Rejected overlapping creation does not create a review');
      activation.release();
      await Promise.all([moving, waitTransition]);
      check(api.selectedProject().id === 'C' && await DataExReviewProjects.active() === 'C' && !document.querySelector('#review-workspace select').disabled, 'Transition completion restores a consistent enabled selector');

      const stale = window.testGate('ensure:A');
      bind('A', 'request-stale');
      await stale.entered;
      bind('B', 'request-current');
      await api.whenIdle();
      stale.release();
      await tick();
      check(api.selectedProject().id === 'B' && await DataExReviewProjects.active() === 'B' && api.snapshot().extractionId === 'request-current', 'Superseded bind cannot change active review or current record');
      const failed = await Promise.allSettled([api.selectProject('missing')]);
      check(failed[0].status === 'rejected' && !document.querySelector('#review-workspace select').disabled, 'Failed transition releases the switch lock');
      await api.selectProject('C');
      await api.whenIdle();
      check(api.selectedProject().id === 'C' && await DataExReviewProjects.active() === 'C', 'A subsequent switch succeeds without a deadlock');
      return checks;
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
