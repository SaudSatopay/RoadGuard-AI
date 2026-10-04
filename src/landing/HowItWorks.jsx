import { motion } from "framer-motion";
import { useEntrance } from "@shared/lib/motion.js";

const STEPS = [
  {
    km: 0,
    title: "Photograph",
    text: "A citizen photographs the road in the app or sends it on WhatsApp. Location comes from the phone, or from the photo itself.",
  },
  {
    km: 1,
    title: "Detect",
    text: "A YOLO26 detector finds potholes and longitudinal, transverse and alligator cracks. A second model traces how long each crack runs.",
  },
  {
    km: 2,
    title: "Merge",
    text: "Reports within 25 m of each other become one hazard (DBSCAN). Ten people reporting one pothole raise its priority instead of the pile.",
  },
  {
    km: 3,
    title: "Weigh",
    text: "Severity combines defect type, extent, road class and confidence. A rupee estimate and a monsoon-aware forecast come with it.",
  },
  {
    km: 4,
    title: "File",
    text: "A complaint letter goes to the right ward office with the photo, GPS, severity and cost attached, ready to send or print.",
  },
  {
    km: 5,
    title: "Close",
    text: "The crew fixes it, the inspector marks it fixed, the public ledger updates and the ward's scorecard moves.",
  },
];

/** The Indian kilometre stone: white body, rounded top, yellow cap for a national highway. */
function KmStone({ km, className = "" }) {
  return (
    <svg viewBox="0 0 64 86" className={className} aria-hidden="true">
      <path d="M5 84V34a27 27 0 0 1 54 0v50z" fill="var(--color-sheet)" stroke="var(--color-ink)" strokeWidth="2" />
      <path d="M6 34a26 26 0 0 1 52 0z" fill="var(--color-paint)" />
      <path d="M5 34h54" stroke="var(--color-ink)" strokeWidth="2" />
      <text x="32" y="52" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fontWeight="600" fill="var(--color-ink-2)" letterSpacing="1">KM</text>
      <text x="32" y="76" textAnchor="middle" fontFamily="var(--font-display)" fontSize="26" fontWeight="800" fill="var(--color-ink)">{km}</text>
      <path d="M3 84h58" stroke="var(--color-ink)" strokeWidth="2" />
    </svg>
  );
}

export default function HowItWorks() {
  const enter = useEntrance();
  return (
    <section id="how" className="scroll-mt-6 border-t border-line bg-paper-2" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid gap-6 lg:grid-cols-12">
          <p className="label text-ink-3 lg:col-span-3 lg:pt-3">CH 0+250 · How it works</p>
          <div className="lg:col-span-8">
            <h2 id="how-title" className="font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl">
              What happens after the photo is taken
            </h2>
            <p className="mt-5 max-w-[60ch] text-lg text-ink-2">
              Six stages, each one measured and logged, so a complaint arrives at the ward office as evidence rather than an
              opinion.
            </p>
          </div>
        </div>

        {/* The road: stones stand on its verge at desktop; it runs down the left edge on phones. */}
        <ol className="relative mt-16 grid gap-x-6 gap-y-10 lg:grid-cols-6">
          <div aria-hidden="true" className="absolute bottom-0 left-[26px] top-0 w-9 bg-asphalt lg:hidden">
            <div className="mx-auto h-full w-[2px] bg-[repeating-linear-gradient(180deg,var(--color-chalk)_0_14px,transparent_14px_26px)] opacity-60" />
          </div>
          <div aria-hidden="true" className="absolute inset-x-0 top-[78px] hidden h-10 bg-asphalt lg:block">
            <div className="lane-dash absolute inset-x-0 top-1/2 -translate-y-1/2 text-chalk opacity-60" />
          </div>
          {STEPS.map((s, i) => (
            <motion.li
              key={s.km}
              className="relative grid grid-cols-[88px_1fr] items-start gap-x-4 lg:block"
              initial={enter ? { y: 12 } : false}
              whileInView={{ y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <KmStone km={s.km} className="relative z-[1] mx-[14px] w-[48px] lg:mx-0 lg:w-[58px]" />
              <div className="lg:mt-10">
                <h3 className="sign text-2xl leading-none">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
