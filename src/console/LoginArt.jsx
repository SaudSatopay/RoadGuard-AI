import MarkedPhoto from "@shared/ui/MarkedPhoto.jsx";
import showcase from "@shared/data/showcase.json";

/** The sample survey shown beside the sign-in form on wide screens. */
export default function LoginArt() {
  const plate = showcase.items[1] || showcase.items[0];
  return (
    <>
      <MarkedPhoto src={plate.src} width={plate.width} height={plate.height} detections={plate.detections} mode="marks" notes="compact" alt={`Sample survey: ${plate.source}`} />
      <p className="mt-3 font-mono text-2xs text-chalk-2">{plate.source} · {plate.detections.length} defect{plate.detections.length === 1 ? "" : "s"} marked</p>
    </>
  );
}
