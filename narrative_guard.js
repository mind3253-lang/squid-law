(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SquidNarrativeGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PARTY_RANKING = [
    /(?:원고|피고|상대방|신청인|피신청인|채권자|채무자)(?:의| 측의)?\s*(?:말|진술|주장|입장)(?:이|가)?\s*(?:더\s*)?(?:정확|타당|신빙성|설득력|우세|유리)/,
    /(?:원고|피고|상대방|신청인|피신청인|채권자|채무자)(?:이|가| 측이)?\s*(?:더\s*)?(?:정확|타당|신빙성(?:이)? 높|설득력(?:이)? 높|우세|유리)/,
    /(?:진술|주장)\s*(?:점수|신빙성 점수|증거 점수)(?:가|는)?\s*(?:더\s*)?높/,
    /(?:승소|패소)\s*(?:가능성|확률)\s*(?:이|가)?\s*\d+(?:\.\d+)?\s*%/
  ];

  const EVIDENCE_ABSENCE_EQUALS_LOSS = [
    /(?:계약서|차용증|직접증거|증거)(?:가|이)?\s*(?:없|부족).{0,35}(?:상대방|원고|피고).{0,25}(?:유리|우세|타당|정확|신빙성)/,
    /(?:계약서|차용증|직접증거|증거)(?:가|이)?\s*(?:없|부족).{0,35}(?:불리하므로|불리해서).{0,30}(?:끝|어렵|패소)/
  ];

  const HABITUAL_DISCLAIMER = [
    /(?:다만|그러나|한편)[,\s]*(?:당신|사용자|의뢰인)?(?:의)?\s*(?:말|진술|설명)(?:이|가)?\s*(?:사실인지|맞는지)\s*(?:확인|검증)(?:할|하기)\s*수\s*없/,
    /(?:다만|그러나)[,\s]*.{0,35}(?:때문이라고|원인이라고)\s*(?:단정|확정)할\s*수\s*없/
  ];

  function normalize(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
  function hitAny(text, rules) { const t = normalize(text); return rules.some((r) => r.test(t)); }

  function validateNarrative(text, context) {
    const t = normalize(text);
    const ctx = context || {};
    const violations = [];
    if (hitAny(t, PARTY_RANKING)) violations.push({ code: 'PARTY_RANKING_FORBIDDEN', message: '당사자 주장·진술의 우열을 자유평가하는 문장은 출력할 수 없습니다.' });
    if (hitAny(t, EVIDENCE_ABSENCE_EQUALS_LOSS)) violations.push({ code: 'MISSING_DIRECT_EVIDENCE_IS_NOT_OPPONENT_WIN', message: '직접증거 부재를 상대방 우위 또는 사건 종료로 변환할 수 없습니다.' });
    if (!ctx.explicitConflict && !ctx.sourceMismatch && hitAny(t, HABITUAL_DISCLAIMER)) violations.push({ code: 'HABITUAL_DISCLAIMER_FORBIDDEN', message: '자료 충돌이나 출처 불일치가 없는 경우 습관성 면책·의심 문구를 붙일 수 없습니다.' });
    return { ok: violations.length === 0, violations };
  }

  function buildEvidenceGapPlan(input) {
    const x = input || {};
    const direct = Array.isArray(x.directEvidence) ? x.directEvidence.filter(Boolean) : [];
    const indirect = Array.isArray(x.indirectEvidence) ? x.indirectEvidence.filter(Boolean) : [];
    const missing = Array.isArray(x.missingEvidence) ? x.missingEvidence.filter(Boolean) : [];
    const opponent = Array.isArray(x.opponentEvidence) ? x.opponentEvidence.filter(Boolean) : [];
    return {
      principle: '증거 부족 ≠ 상대방 주장 우위',
      userClaim: x.userClaim || '',
      directEvidence: direct,
      indirectEvidence: indirect,
      opponentClaim: x.opponentClaim || '',
      opponentEvidence: opponent,
      evidenceGap: direct.length === 0 ? '직접증거 미확보' : '',
      nextAction: direct.length === 0
        ? (indirect.length ? '현재 간접자료를 연결해 사실관계를 구성하고 추가 보강자료를 탐색합니다.' : '간접증거와 추가 확보 가능한 자료를 탐색합니다.')
        : '직접증거와 반박자료의 연결관계를 점검합니다.',
      missingEvidence: missing
    };
  }

  function enforceNarrative(text, context) {
    const result = validateNarrative(text, context);
    if (!result.ok) {
      const err = new Error('SQUID_LAW_NARRATIVE_BLOCKED');
      err.code = 'SQUID_LAW_NARRATIVE_BLOCKED';
      err.violations = result.violations;
      throw err;
    }
    return text;
  }

  return { validateNarrative, enforceNarrative, buildEvidenceGapPlan };
});
