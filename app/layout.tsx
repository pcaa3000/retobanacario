import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "La Caja de Doña Rosa",
  description:
    "De la libreta a la caja: convierte notas de voz y mensajes en el flujo de caja de la bodega.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
