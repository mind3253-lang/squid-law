export function writeLockRequired(tool){return ['github.patch','github.commit','vercel.deploy','file.export'].includes(tool)}
export function canRunWithoutDistributedLock(tool){return ['github.read','github.search','vercel.inspect','vercel.logs','web.search','file.inspect'].includes(tool)}
