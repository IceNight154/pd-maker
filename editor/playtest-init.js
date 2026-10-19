// ================================================================
//  테스트 플레이용 gradle init 스크립트 (main.js 가 씀 — Electron 없이 테스트할 수 있게 따로)
//    build.gradle 을 고치지 않고 desktop:pdmakerPlaytest 작업을 더하고, desktop:debug 에도 같은 값을 넘김
//    pdmaker.project = 프로젝트 폴더 · pdmaker.testenv = 실행 환경(PDM.testEnv.resolve 결과 JSON — 런타임 MakerTestEnv, 5차)
// ================================================================
/** groovy 작은따옴표 문자열 안에 넣을 수 있게 */
const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
function build(projectDir, testenv) {
  const proj = String(projectDir).replace(/\\/g, '/');
  const env = testenv ? JSON.stringify(testenv) : '';
  return [
    '// PDMaker 가 만든 파일. build.gradle 을 고치지 않고 테스트 실행 작업을 추가합니다.',
    'gradle.projectsEvaluated {',
    "    def d = rootProject.findProject(':desktop')",
    "    if (d == null) throw new GradleException('desktop project not found')",
    "    d.tasks.register('pdmakerPlaytest', JavaExec) {",
    "        group = 'pdmaker'",
    '        classpath = d.sourceSets.main.runtimeClasspath',
    "        mainClass.set('com.shatteredpixel.shatteredpixeldungeon.desktop.DesktopLauncher')",
    '        ignoreExitValue = true',
    "        systemProperty 'Specification-Title', 'PDMaker Playtest'",
    "        systemProperty 'Implementation-Title', d.appPackageName",
    "        systemProperty 'Specification-Version', d.appVersionName + '-PLAYTEST'",
    "        systemProperty 'Implementation-Version', d.appVersionCode",
    `        systemProperty 'pdmaker.project', '${q(proj)}'`,
    env ? `        systemProperty 'pdmaker.testenv', '${q(env)}'` : null,
    "        jvmArgs '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8'",
    "        if (System.getProperty('os.name').toLowerCase().contains('mac')) jvmArgs '-XstartOnFirstThread'",
    '    }',
    '    // desktop:debug (게임 원래 실행 작업 — INDEV 버전) 으로 테스트할 때도 이 프로젝트 · 실행 환경을 넘겨줌',
    "    def dbg = d.tasks.findByName('debug')",
    '    if (dbg != null) {',
    `        dbg.systemProperty 'pdmaker.project', '${q(proj)}'`,
    env ? `        dbg.systemProperty 'pdmaker.testenv', '${q(env)}'` : null,
    "        dbg.jvmArgs '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8'",
    '    }',
    '}', ''].filter(l => l !== null).join('\n');
}
module.exports = { build, quote: q };
