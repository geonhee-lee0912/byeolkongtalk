// components/admin/EnvBanner.tsx — DEV/PROD 오조작 방지 배지 (서버 컴포넌트).
export function EnvBanner() {
  const env = process.env.VERCEL_ENV; // 'production' | 'preview' | undefined(local)
  const conf =
    env === "production"
      ? { label: "PROD", cls: "bg-red-600 text-white" }
      : env === "preview"
        ? { label: "DEV", cls: "bg-yellow-400 text-black" }
        : { label: "LOCAL", cls: "bg-gray-500 text-white" };
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${conf.cls}`}
    >
      {conf.label}
    </span>
  );
}
