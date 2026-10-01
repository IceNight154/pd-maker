// ================================================================
//  조건식 (Cond) — 에디터와 게임 런타임(Cond.java)이 같은 문법을 씁니다.
//
//    favor>=600 && temper>0
//    switch.bridge_fixed && !(var.gold < 100)
//    hero.class=='aria' || char.mireille.trust>=200
//
//  이름(변수)이 없으면 0 으로 봅니다. 빈 식은 true.
// ================================================================
PDM.Cond = (function () {
  const OPS = ['&&', '||', '==', '!=', '>=', '<=', '>', '<', '!', '(', ')'];

  function tokenize(src) {
    const out = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      const two = src.substr(i, 2);
      if (OPS.includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
      if (OPS.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
      if (c === '=' ) { out.push({ t: 'op', v: '==' }); i++; continue; } // 실수로 = 하나만 써도 비교로 봄
      if (c === "'" || c === '"') {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== c) s += src[j++];
        if (j >= src.length) throw new Error('따옴표가 닫히지 않았습니다');
        out.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i + 1; while (j < src.length && /[0-9.]/.test(src[j])) j++;
        out.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
      }
      if (/[A-Za-z_ㄱ-힝]/.test(c)) {
        let j = i + 1; while (j < src.length && /[A-Za-z0-9_.%:ㄱ-힝]/.test(src[j])) j++;
        const w = src.slice(i, j);
        if (w === 'true' || w === 'false') out.push({ t: 'bool', v: w === 'true' });
        else if (w === 'and') out.push({ t: 'op', v: '&&' });
        else if (w === 'or') out.push({ t: 'op', v: '||' });
        else if (w === 'not') out.push({ t: 'op', v: '!' });
        else out.push({ t: 'name', v: w });
        i = j; continue;
      }
      throw new Error(`알 수 없는 글자: '${c}'`);
    }
    return out;
  }

  function parse(src) {
    if (src == null || String(src).trim() === '') return { k: 'lit', v: true };
    const tk = tokenize(String(src)); let p = 0;
    const peek = () => tk[p], next = () => tk[p++];
    const isOp = v => tk[p] && tk[p].t === 'op' && tk[p].v === v;
    function orE() { let l = andE(); while (isOp('||')) { next(); l = { k: 'or', l, r: andE() }; } return l; }
    function andE() { let l = notE(); while (isOp('&&')) { next(); l = { k: 'and', l, r: notE() }; } return l; }
    function notE() { if (isOp('!')) { next(); return { k: 'not', e: notE() }; } return cmp(); }
    function cmp() {
      const l = prim();
      const t = peek();
      if (t && t.t === 'op' && ['==', '!=', '>=', '<=', '>', '<'].includes(t.v)) { next(); return { k: 'cmp', op: t.v, l, r: prim() }; }
      return l;
    }
    function prim() {
      const t = next();
      if (!t) throw new Error('식이 중간에 끝났습니다');
      if (t.t === 'op' && t.v === '(') { const e = orE(); if (!isOp(')')) throw new Error("')' 가 없습니다"); next(); return e; }
      if (t.t === 'num' || t.t === 'str' || t.t === 'bool') return { k: 'lit', v: t.v };
      if (t.t === 'name') return { k: 'name', v: t.v };
      throw new Error(`여기에 '${t.v}' 는 올 수 없습니다`);
    }
    const e = orE();
    if (p < tk.length) throw new Error(`'${tk[p].v}' 뒤를 해석할 수 없습니다`);
    return e;
  }

  function truthy(v) { return !(v === false || v === 0 || v === '' || v == null); }
  function evalAst(n, resolve) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'name': { const v = resolve(n.v); return v === undefined ? 0 : v; }
      case 'not': return !truthy(evalAst(n.e, resolve));
      case 'and': return truthy(evalAst(n.l, resolve)) && truthy(evalAst(n.r, resolve));
      case 'or': return truthy(evalAst(n.l, resolve)) || truthy(evalAst(n.r, resolve));
      case 'cmp': {
        let a = evalAst(n.l, resolve), b = evalAst(n.r, resolve);
        if (typeof a === 'boolean') a = a ? 1 : 0; if (typeof b === 'boolean') b = b ? 1 : 0;
        switch (n.op) {
          case '==': return String(a) === String(b);
          case '!=': return String(a) !== String(b);
          case '>=': return +a >= +b; case '<=': return +a <= +b;
          case '>': return +a > +b; case '<': return +a < +b;
        }
      }
    }
    return false;
  }
  function names(n, out = []) {
    if (!n) return out;
    if (n.k === 'name') out.push(n.v);
    ['l', 'r', 'e'].forEach(k => n[k] && names(n[k], out));
    return out;
  }

  const cache = new Map();
  function compiled(src) {
    const key = String(src ?? '');
    if (!cache.has(key)) cache.set(key, parse(key));
    return cache.get(key);
  }
  return {
    parse,
    /** 식이 올바르면 null, 아니면 오류 문구 */
    check(src) { try { parse(src); return null; } catch (e) { return e.message; } },
    evaluate(src, resolve) { try { return truthy(evalAst(compiled(src), resolve || (() => 0))); } catch (e) { return false; } },
    names(src) { try { return [...new Set(names(parse(src)))]; } catch (e) { return []; } },
    /** 조건이 얼마나 구체적인지 (대사 고르기용): 사용한 이름 개수 */
    specificity(src) { try { return names(parse(src)).length; } catch (e) { return 0; } }
  };
})();
