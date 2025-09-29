import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCF Analysis - Purchase Order Data Analysis",
  description: "Advanced purchase order data analysis and reporting system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning={true}>
        {children}
      </body>
    </html>
  );
}
