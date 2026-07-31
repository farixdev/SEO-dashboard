export default function Loading() {
  return (
    <div className="panel p-10">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
        <div className="skeleton size-12 rounded-full" />
        <div className="skeleton h-4 w-56" />
        <div className="skeleton h-3 w-72" />
        <div className="skeleton h-3 w-64" />
      </div>
    </div>
  );
}
