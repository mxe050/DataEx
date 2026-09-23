const result=require('./dataex-ukbeam-checks.js')(require('./dataex-ukbeam.fixture.cjs').fixture());
result.checks.forEach(name=>console.log('PASS '+name));console.log(JSON.stringify(result));
