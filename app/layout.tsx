import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SIP Control de Lámparas",
    template: "%s | SIP",
  },
  description:
    "Dashboard industrial para controlar 15 lámparas conectadas a un Siemens LOGO! mediante access point.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "SIP Control de Lámparas",
    description:
      "Control AUTO/MAN, timers y tags LOGO! para un sistema de 15 lámparas.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
