export default function ComingSoon({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-[#1E2632] bg-[#121723] p-8 text-center">
      <div className="text-lg font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-[#9CA7BB]">{reason}</p>
      <div className="mt-4 inline-block rounded-full bg-[#1A2130] px-3 py-1 text-xs text-[#7C879B]">
        Not implemented in the source app
      </div>
    </div>
  );
}
