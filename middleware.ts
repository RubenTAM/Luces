import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE } from "./lib/session";

// node:crypto (createHmac, timingSafeEqual) necesita el runtime completo de
// Node, no el runtime "edge" por defecto de los middlewares de Next.
export const runtime = "nodejs";

// Rutas que cualquiera puede pedir sin haber iniciado sesión.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Assets de Next (_next/...) y el ícono/manifest ya los excluye el matcher
  // de abajo, así que aquí solo hace falta cubrir las rutas de la app.
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? decodeSession(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // "soporte" hace todo menos Configuración — si intenta entrar, lo regresamos
  // al dashboard en vez de dejarlo pasar.
  if (pathname.startsWith("/configuracion") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname.startsWith("/api/users") && session.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }
  if (pathname.startsWith("/api/lamps-config") && session.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }
  if (pathname.startsWith("/api/plcs") && session.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sip-logo-cropped.png).*)"],
};
