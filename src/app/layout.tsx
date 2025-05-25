// === File: app/layout.tsx ===
import type { Metadata } from "next";
import { Figtree } from "next/font/google"; // Import Figtree
import "./globals.css";

// Configure Figtree font
const figtree = Figtree({
  subsets: ["latin"],
  display: "swap", // Ensures text remains visible during font loading
  variable: "--font-figtree", // Optional: if you want to use it as a CSS variable
  weight: ['300', '400', '500', '600', '700', '800', '900'] // Specify weights you'll use
});

export const metadata: Metadata = {
  title: "Exogtic AI Chat ✨", // You can customize this
  description: "Chat with your personalized AI assistant", // And this
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${figtree.variable} font-sans antialiased`}> {/* Apply Figtree variable and Tailwind's sans class */}
      <body>{children}</body>
    </html>
  );
}