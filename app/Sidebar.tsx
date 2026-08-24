"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";

export type SidebarActive = "dashboard" | "configuracion" | "historial";

// Sidebar único compartido por Dashboard, Configuración e Historial. Antes
// cada pantalla traía su propia copia de este menú (con sus propios íconos
// y su propia lista de botones) y se desincronizaban solas cada vez que se
// editaba una sin tocar la otra — de ahí que en algún momento Configuración
// se viera distinta al Dashboard sin que nadie lo hubiera pedido así. Ahora
// solo hay un lugar donde se edita el menú.
//
// En pantallas angostas (celular) esto se convierte en una barrita fija
// arriba (logo + botón de menú) más un cajón que se abre encima de todo —
// antes el sidebar de escritorio (pensado para ir a un lado, siempre
// visible) se aplastaba y se estiraba a lo ancho de la pantalla, empujando
// "Cerrar sesión" fuera de la vista y dejando el logo con una proporción
// rara. El CSS de esto vive en globals.css bajo "@media (max-width:860px)".
export function Sidebar({ active }: { active: SidebarActive }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <>
      <div className="mobile-topbar">
        <button type="button" className="mobile-menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Icon name="menu" size={22}/>
        </button>
        <Image
          className="mobile-topbar-logo"
          src="/sip-logo-cropped.png"
          alt="SIP Sistemas Inteligentes del Pacífico"
          width={320}
          height={143}
          unoptimized
        />
      </div>

      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <aside className={`sip-sidebar ${open ? "open" : ""}`} aria-label="Navegación principal">
        <button type="button" className="sidebar-close" onClick={() => setOpen(false)} aria-label="Cerrar menú">
          <Icon name="close" size={16}/>
        </button>
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
          <button className={active === "dashboard" ? "active" : ""} type="button" onClick={() => go("/")}>
            <Icon name="home"/>Dashboard
          </button>
          <span className="nav-section">Sistema</span>
          <button className={active === "configuracion" ? "active" : ""} type="button" onClick={() => go("/configuracion")}>
            <Icon name="settings"/>Configuración
          </button>
          <button className={active === "historial" ? "active" : ""} type="button" onClick={() => go("/historial")}>
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
    </>
  );
}
