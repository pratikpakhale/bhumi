import { Masthead } from "@/components/Chrome";
import { Loading } from "@/components/Status";

/** Shown while a server-rendered screen streams in — rarely for long, since nothing on the server waits on the portal. */
export default function RouteLoading() {
  return (
    <div className="shell">
      <Masthead />
      <main className="gate">
        <Loading label="Opening the page…" size="lg" />
      </main>
    </div>
  );
}
