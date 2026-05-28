import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "detect-backend-threat · SOC Dashboard",
  description: "Real-time cybersecurity threat detection and visualization",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
