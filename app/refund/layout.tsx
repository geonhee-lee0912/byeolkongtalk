import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "환불정책",
  description: "별콩톡 별(재화) 환불정책입니다.",
  alternates: { canonical: "/refund" },
};

export default function RefundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
