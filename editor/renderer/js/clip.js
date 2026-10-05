// ================================================================
//  공용 클립보드 — Ctrl+C / Ctrl+V (편집 › 단축키 설정 의 "복사" · "붙여넣기")
//    { kind, payload, label } 를 메모리에 두고, 시스템 클립보드에도 JSON 으로 써서 다른 프로젝트 · 다른 PDMaker 창에도 붙여 넣을 수 있음
//    kind: 'res:<종류>' (캐릭터 · 아이템 · 이벤트 · 맵 오브젝트 · 방 템플릿 · 영웅 리소스 통째로)
//          'list:<저장 키>' (이펙트 · 필터 · 글자 연출 · 퀘스트 · 배지 등 목록 항목) · 'nodes' (맵 그래프 노드) · 'mapobj' (맵 오브젝트 칸) · 'cmds' (이벤트 명령)
//    붙여넣기 순서: 지금 탭 편집기의 ctx.paste → 리소스 · 목록 항목 기본 처리
// ================================================================
(function () {
  const MARK = 'pdmaker-clip';
  let mem = null;
  async function set(kind, payload, label) {
    mem = { kind, payload: PDM.clone(payload), label: label || '' };
    try { if (navigator.clipboard) await navigator.clipboard.writeText(JSON.stringify({ [MARK]: 1, kind, label: mem.label, payload })); } catch (_) { /* 권한이 없으면 메모리만 */ }
    toast(`복사했습니다${label ? ': ' + label : ''}`);
  }
  /** 지금 클립보드 (시스템 클립보드에 PDMaker 데이터가 있으면 그것, 없으면 메모리) */
  async function get() {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const t = await navigator.clipboard.readText();
        if (t && t.includes(MARK)) { const o = JSON.parse(t); if (o && o[MARK]) return { kind: o.kind, payload: o.payload, label: o.label || '' }; }
      }
    } catch (_) { /* 읽을 수 없으면 메모리 */ }
    return mem ? { kind: mem.kind, payload: PDM.clone(mem.payload), label: mem.label } : null;
  }
  const peek = () => mem;
  PDM.clip = { set, get, peek };
})();
