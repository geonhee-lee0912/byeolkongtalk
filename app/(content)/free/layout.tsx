export default function FreeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="w-full max-w-md mx-auto px-5 pt-6 pb-10 animate-fade-in">
      {children}
    </main>
  );
}
