import Image from "next/image";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const redirectTo = from && from.startsWith("/") ? from : "/";

  return (
    <main className="login-shell">
      <div className="login-card">
        <Image
          className="login-logo"
          src="/sip-logo-cropped.png"
          alt="SIP Sistemas Inteligentes del Pacífico"
          width={220}
          height={98}
          priority
          unoptimized
        />
        <h1>Control de Lámparas</h1>
        <p>Inicia sesión para continuar.</p>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
