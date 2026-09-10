import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI DSA Tutor",
  description: "Socratic AI tutor for Data Structures & Algorithms practice",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: ["/icon.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fontsource/mona-sans@5.0.0/index.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.0/index.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
