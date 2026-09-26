import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono, Shippori_Mincho } from "next/font/google";
import "./globals.css";

// Tipografías: Shippori Mincho para títulos, Manrope para el texto y
// JetBrains Mono para horas, credenciales y puntajes.
// Estilo "Noche": títulos con Shippori Mincho, una serifa japonesa elegante
// (va con la identidad de Shimaya); el texto sigue en Manrope, que se lee
// mejor en tamaños chicos.
const fuenteDisplay = Shippori_Mincho({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});
const fuenteBody = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});
const fuenteData = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-data",
});

export const metadata: Metadata = {
  title: "Agenda Operativa - Shimaya",
  description: "Sistema de gestión operativa Shimaya",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Shimaya",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${fuenteDisplay.variable} ${fuenteBody.variable} ${fuenteData.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('shimaya-tema');if(t==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
