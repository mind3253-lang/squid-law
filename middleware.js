export const config = { matcher: ['/admin', '/admin/:path*'] };

export default function middleware(request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new Response('관리자 인증이 아직 설정되지 않았습니다. Vercel 환경변수 ADMIN_PASSWORD를 설정하세요.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  const header = request.headers.get('authorization') || '';
  let valid = false;
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const separator = decoded.indexOf(':');
      const username = decoded.slice(0, separator);
      const supplied = decoded.slice(separator + 1);
      valid = separator >= 0 && username === 'admin' && supplied === password;
    } catch {}
  }
  if (!valid) {
    return new Response('관리자 인증이 필요합니다.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="SQUIDLAW Admin", charset="UTF-8"',
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }
  return undefined;
}
