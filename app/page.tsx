import type { Metadata } from "next";
import { LampDashboard } from "./LampDashboard";

export const metadata: Metadata = {
  title: "Control de Lamparas SIP",
  description:
    "Dashboard SIP para controlar modo AUTO/MAN, hora de encendido y hora de apagado de 15 lamparas.",
};

export default function Home() {
  return <LampDashboard />;
}