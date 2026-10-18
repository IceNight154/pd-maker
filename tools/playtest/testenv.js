#!/usr/bin/env node
// 실행 환경 JSON (편집기 PDM.testEnv.resolve 와 같은 계산) — run.sh 의 TESTENV 로
//   사용: TESTENV="$(node tools/playtest/testenv.js phone-port '{"safeArea":"notch","speed":2}')" tools/playtest/run.sh …
const env = require('../tests/editor-env');
const { PDM } = env.load();
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
process.stdout.write(JSON.stringify(PDM.testEnv.resolve(Object.assign({ env: process.argv[2] || 'pc' }, extra))));
