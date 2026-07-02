export default function ComingSoon({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-line bg-panel p-8 text-center">
      <div className="text-lg font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-ink-3">{reason}</p>
      <div className="mt-4 inline-block rounded-full bg-raised px-3 py-1 text-xs text-mute">
        Not implemented in the source app
      </div>
    </div>
  );
}
