import type { Metadata, Viewport } from "next";
import { Newsreader, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Tipografías de la nueva identidad visual (negro / blanco / rojo):
// Newsreader para títulos, Source Sans 3 para texto, JetBrains Mono para
// horas, credenciales y puntajes.
const fuenteDisplay = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["500", "600"],
  variable: "--font-display",
});
const fuenteBody = Source_Sans_3({
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
  themeColor: "#d31e2b",
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
