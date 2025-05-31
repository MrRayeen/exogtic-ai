// === File: app/layout.tsx ===
import type { Metadata } from "next";
import { Figtree, Audiowide } from "next/font/google"; // Audiowide is already imported
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

// Configure Figtree font (your existing code)
const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-figtree",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

// Configure Audiowide font (your existing code)
const audiowide = Audiowide({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-audiowide", // This variable will be used
  weight: ["400"], // Audiowide typically only has the 400 weight
});

export const metadata: Metadata = {
  title: "Exogtic AI Chat ✨",
  description: "Chat with your personalized AI assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Add audiowide.variable here
    <html
      lang="en"
      className={`${figtree.variable} ${audiowide.variable} font-sans antialiased`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
