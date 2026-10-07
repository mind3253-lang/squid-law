const assert = require('assert');
const guard = require('./narrative_guard');

const blocked = [
  '계약서가 없기에 상대방의 진술점수가 더 높습니다.',
  '피고의 주장이 더 타당합니다.',
  '상대방 진술이 더 정확합니다.',
  '차용증이 부족하므로 피고가 유리합니다.',
  '다만 당신의 말이 사실인지 확인할 수 없습니다.',
  '그러나 영석이 때문이라고 단정할 수 없습니다.'
];
for (const s of blocked) assert.strictEqual(guard.validateNarrative(s).ok, false, s);

const allowed = [
  '현재 기록에서 공사계약서는 확인되지 않습니다. 계좌내역, 견적서, 세금계산서, 자재구매, 현장사진, 작업자 진술, 문자·카톡, 일부대금 지급 자료를 추가로 확인합니다.',
  '원고는 2,500만 원을 대여했다고 주장합니다. 피고는 대여금이 아니라고 주장합니다. 현재 제출자료에서 피고 주장을 뒷받침하는 별도 자료는 확인되지 않습니다.',
  '차용증은 없지만 송금내역과 변제 독촉에 대한 답변을 간접자료로 검토합니다.'
];
for (const s of allowed) assert.strictEqual(guard.validateNarrative(s).ok, true, s);

const conflictAllowed = guard.validateNarrative('다만 사용자 설명이 사실인지 확인할 수 없습니다.', { explicitConflict: true });
assert.strictEqual(conflictAllowed.ok, true);

const plan = guard.buildEvidenceGapPlan({
  userClaim: '후불 공사를 완료했다',
  directEvidence: [],
  indirectEvidence: ['현장사진', '자재구매내역'],
  missingEvidence: ['작업자 진술', '카카오톡']
});
assert.strictEqual(plan.principle, '증거 부족 ≠ 상대방 주장 우위');
assert.strictEqual(plan.evidenceGap, '직접증거 미확보');
assert.ok(plan.nextAction.includes('간접자료'));

console.log('narrative_guard: all tests passed');
