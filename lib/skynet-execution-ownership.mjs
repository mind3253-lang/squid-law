/** A deterministic contract: exhaust executable routes before requesting user labour. */
export const EXECUTION_ROUTES=Object.freeze({
 'github.read':Object.freeze(['connected_github','server_github_api']),
 'github.commit':Object.freeze(['connected_github_batch','server_approved_write']),
 'gabia.deploy':Object.freeze(['connected_gabia','server_approved_write']),
 'code.merge':Object.freeze(['local_workspace','connected_github_batch']),
 'code.test':Object.freeze(['local_test_runner','ci_workflow'])
});
const BLOCKED=new Set(['unavailable','failed','unsupported','denied']);
const VALID=new Set(['available','unavailable','failed','unsupported','denied','unknown']);
const PERMISSION=new Set(['approval_required','scope_required','credentials_required']);
export function resolveExecutionOwnership({operation,capabilities={},attempts=[],approvalRequired=false}={}){
 const routes=EXECUTION_ROUTES[operation];
 if(!routes)throw Error('UNKNOWN_OPERATION');
 if(!capabilities||typeof capabilities!=='object'||Array.isArray(capabilities))throw Error('INVALID_CAPABILITIES');
 if(!Array.isArray(attempts)||attempts.length>50)throw Error('INVALID_ATTEMPTS');
 const tried=new Set();
 for(const a of attempts){if(!a||!routes.includes(a.route)||!BLOCKED.has(a.outcome))throw Error('INVALID_ATTEMPT');tried.add(a.route)}
 for(const route of routes){const state=capabilities[route]??'unknown';if(!VALID.has(state))throw Error('INVALID_CAPABILITY_STATE');
  if(state==='available'&&!tried.has(route))return {owner:'system',status:approvalRequired?'approval_required':'ready',route,operation,attempted:[...tried]};
 }
 const unexamined=routes.filter(route=>(capabilities[route]??'unknown')==='unknown'&&!tried.has(route));
 if(unexamined.length)return {owner:'system',status:'inspect_capabilities',routes:unexamined,operation,attempted:[...tried]};
 const retryable=routes.filter(route=>capabilities[route]==='available'&&!tried.has(route));
 if(retryable.length)return {owner:'system',status:'ready',route:retryable[0],operation,attempted:[...tried]};
 return {owner:'system',status:'blocked',operation,attempted:[...tried],reason:'NO_EXECUTABLE_ROUTE',requiredAction:'configure_an_execution_route'};
}
/** Never request a manual step until capability inspection and alternative routes are exhausted. */
export function userHandoff(decision,{reason,action}={}){
 if(!decision||decision.owner!=='system')throw Error('INVALID_DECISION');
 if(decision.status==='ready'||decision.status==='inspect_capabilities')throw Error('SYSTEM_WORK_REMAINS');
 if(decision.status==='approval_required')return {owner:'user',kind:'approval',operation:decision.operation,action:'approve_the_exact_operation'};
 if(decision.status!=='blocked'||!reason||!action||typeof reason!=='string'||typeof action!=='string'||reason.length>300||action.length>300)throw Error('ACTIONABLE_HANDOFF_REQUIRED');
 return {owner:'user',kind:'configuration',operation:decision.operation,reason,action};
}
export function batchNextAction(reason){
 if(reason==='approval_required')return {owner:'user',kind:'approval',action:'approve_the_exact_operation'};
 if(reason==='scope_required')return {owner:'user',kind:'configuration',action:'grant_the_required_scope'};
 if(reason==='tool_failed')return {owner:'system',kind:'diagnose',action:'inspect_tool_failure_and_alternative_routes'};
 if(reason==='job_completed')return {owner:'system',kind:'none',action:'none'};
 return {owner:'system',kind:'continue_or_inspect',action:'inspect_job_state_before_requesting_manual_work'};
}
