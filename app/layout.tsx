import "./globals.css";

export const metadata = {
  title: "Film Location Finder",
  description: "Estimate filming locations from a film title and timestamp."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
