import Image from "next/image";

export default function MonthlyNoteCard({ note }: { note: string }) {
  return (
    <div className="bg-[#211A33] rounded-3xl px-4 pt-4 pb-[17px]">
      <div className="flex items-center gap-[9px] mb-[9px]">
        <Image
          src="/byeolkong-main.png"
          alt="별콩이"
          width={32}
          height={32}
          className="w-8 h-8 rounded-full object-cover border-[1.5px] border-[#4A3D6B] bg-[#3A2F55]"
        />
        <span className="text-[12px] font-extrabold text-[#F5D680]">별콩이의 한마디</span>
      </div>
      <p className="text-[13px] leading-[1.78] text-[#ECE3FB] whitespace-pre-line">{note}</p>
    </div>
  );
}
