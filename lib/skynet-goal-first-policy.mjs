/** Goal-first execution policy. Commits are checkpoints, never the completion metric. */
export function planGoalFirstExecution({goal,remainingTasks=[],completedTasks=[],risk='normal',approvalRequired=false,blockingReason=null,uncommittedChanges=0}={}){
 if(typeof goal!=='string'||!goal.trim())throw Error('GOAL_REQUIRED');
 if(!Array.isArray(remainingTasks)||!Array.isArray(completedTasks))throw Error('INVALID_TASK_LIST');
 if(!['low','normal','high'].includes(risk))throw Error('INVALID_RISK');
 if(!Number.isSafeInteger(uncommittedChanges)||uncommittedChanges<0)throw Error('INVALID_CHANGE_COUNT');
 const remaining=remainingTasks.filter(x=>typeof x==='string'&&x.trim());
 const completed=completedTasks.filter(x=>typeof x==='string'&&x.trim());
 const total=remaining.length+completed.length;
 const progress={completed:completed.length,remaining:remaining.length,total,ratio:total?completed.length/total:0};
 if(approvalRequired)return {action:'request_approval',owner:'user',reason:'EXPLICIT_APPROVAL_GATE',progress};
 if(blockingReason)return {action:'diagnose_blocker',owner:'system',reason:String(blockingReason).slice(0,300),progress};
 if(remaining.length)return {action:'implement_next_task',owner:'system',task:remaining[0],checkpoint:risk==='high'?'validate_before_next_risky_step':'defer_redundant_validation',commitPolicy:'batch_by_coherent_change',progress};
 if(uncommittedChanges)return {action:'validate_and_commit',owner:'system',checkpoint:'run_relevant_tests',commitPolicy:'batch_by_coherent_change',progress};
 return {action:'verify_goal',owner:'system',checkpoint:'confirm_acceptance_criteria',commitPolicy:'no_empty_commit',progress};
}
export function evaluateGoalCompletion({acceptanceCriteria=[],evidence={},remainingTasks=[]}={}){
 if(!Array.isArray(acceptanceCriteria)||!Array.isArray(remainingTasks)||!evidence||typeof evidence!=='object')throw Error('INVALID_GOAL_EVIDENCE');
 const unmet=acceptanceCriteria.filter(c=>typeof c!=='string'||!c.trim()||evidence[c]!==true);
 return {completed:acceptanceCriteria.length>0&&unmet.length===0&&remainingTasks.length===0,unmet,remainingTasks:remainingTasks.length};
}
