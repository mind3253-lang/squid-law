const api='https://api.github.com';
function config() {
 const token=process.env.SKYNET_GITHUB_TOKEN;
 const repo=process.env.SKYNET_DEV_REPOSITORY || 'mind3253-lang/squid-law';
 if(!token) throw new Error('SKYNET_GITHUB_TOKEN missing');
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Invalid repository');
 return {token,repo};
}
async function request(method,path,body) {
 const {token,repo}=config();
 const response=await fetch(api+'/repos/'+repo+path,{
  method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(30000)
 });
 if(!response.ok) throw new Error('GitHub API '+method+' '+response.status);
 return response.status===204?null:response.json();
}
export async function readRepositoryFile(path,branch='main') {
 const file=await request('GET','/contents/'+encodePath(path)+'?ref='+encodeURIComponent(branch));
 if(file.type!=='file'||file.encoding!=='base64') throw new Error('Not a regular repository file');
 return {content:Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'),sha:file.sha};
}
function encodePath(path) {
 if(typeof path!=='string'||!path||path.startsWith('/')||path.split('/').some(x=>x==='..'||x==='.'||!x)) throw new Error('Invalid file path');
 return path.split('/').map(encodeURIComponent).join('/');
}
export async function proposeFileChanges({taskId,files,baseBranch='main'}) {
 if(!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error('Invalid task ID');
 if(!Array.isArray(files)||files.length<1||files.length>20) throw new Error('Invalid file count');
 const branch='skynet-dev/'+taskId;
 const base=await request('GET','/git/ref/heads/'+encodeURIComponent(baseBranch));
 await request('POST','/git/refs',{ref:'refs/heads/'+branch,sha:base.object.sha});
 const results=[];
 for(const file of files) {
  const path=encodePath(file.path);
  if(typeof file.content!=='string'||file.content.length>150000) throw new Error('Invalid file content');
  let sha;
  try {sha=(await request('GET','/contents/'+path+'?ref='+encodeURIComponent(branch))).sha;}
  catch(e) {if(!String(e.message).includes(' 404')) throw e;}
  const result=await request('PUT','/contents/'+path,{message:'SKYNET development proposal '+taskId,path:file.path,branch,content:Buffer.from(file.content).toString('base64'),...(sha?{sha}:{})});
  results.push({path:file.path,sha:result.commit.sha});
 }
 return {branch,files:results};
}
export async function openProposalPullRequest({taskId,branch,summary,base='main'}) {
 const pr=await request('POST','/pulls',{title:'SKYNET development: '+taskId,head:branch,base,body:String(summary).slice(0,5000),draft:true});
 return {number:pr.number,url:pr.html_url};
}
