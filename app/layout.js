import "./globals.css";

export const metadata = {
  title: "SPEED ETC 明細管理",
  description: "SPEED ETC 明細管理 Next.js frontend"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
