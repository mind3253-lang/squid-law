export const TOOL_SCOPES=Object.freeze({
 'github.read':'repository:read','github.search':'repository:read',
 'github.patch':'repository:write','github.commit':'repository:write',
 'gabia.inspect':'deployment:read','gabia.logs':'deployment:read',
 'gabia.deploy':'deployment:write','web.search':'research:read',
 'file.inspect':'files:read','file.export':'files:write'
});
const writes=new Set(['github.patch','github.commit','gabia.deploy','file.export']);
export function authorizeTool({name,scopes=[],approved=false,args={}}){
 const scope=TOOL_SCOPES[name];
 if(!scope)return {allowed:false,reason:'UNKNOWN_TOOL'};
 if(!Array.isArray(scopes)||!scopes.includes(scope))return {allowed:false,reason:'SCOPE_REQUIRED'};
 if(writes.has(name)&&approved!==true)return {allowed:false,reason:'APPROVAL_REQUIRED'};
 if(JSON.stringify(args??{}).length>100000)return {allowed:false,reason:'ARGUMENT_SIZE_LIMIT'};
 return {allowed:true,scope,requiresAudit:true};
}
