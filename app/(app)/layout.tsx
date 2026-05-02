import BottomNav from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-green-100 pb-16">
      {children}
      <BottomNav />
    </div>
  );
}
