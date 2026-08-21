"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

export type SidebarActive = "dashboard" | "configuracion" | "historial";

// Sidebar único compartido por Dashboard, Configuración e Historial. Antes
// cada pantalla traía su propia copia de este menú (con sus propios íconos
// y su propia lista de botones) y se desincronizaban solas cada vez que se
// editaba una sin tocar la otra — de ahí que en algún momento Configuración
// se viera distinta al Dashboard sin que nadie lo hubiera pedido así. Ahora
// solo hay un lugar donde se edita el menú.
export function Sidebar({ active }: { active: SidebarActive }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sip-sidebar" aria-label="Navegación principal">
      <div className="sip-logo-box">
        <Image
          className="sip-logo-image"
          src="/sip-logo-cropped.png"
          alt="SIP Sistemas Inteligentes del Pacífico"
          width={320}
          height={143}
          priority
          unoptimized
        />
      </div>
      <nav className="sip-nav" aria-label="Sistema">
        <button className={active === "dashboard" ? "active" : ""} type="button" onClick={() => router.push("/")}>
          <Icon name="home"/>Dashboard
        </button>
        <span className="nav-section">Sistema</span>
        <button
          className={active === "configuracion" ? "active" : ""}
          type="button"
          onClick={() => router.push("/configuracion")}
        >
          <Icon name="settings"/>Configuración
        </button>
        <button
          className={active === "historial" ? "active" : ""}
          type="button"
          onClick={() => router.push("/historial")}
        >
          <Icon name="history"/>Historial
        </button>
      </nav>
      <div className="sidebar-footer">
        <button type="button" onClick={handleLogout}>
          <Icon name="headset"/>Cerrar sesión
        </button>
        <span>Versión 1.0.0</span>
      </div>
    </aside>
  );
}
