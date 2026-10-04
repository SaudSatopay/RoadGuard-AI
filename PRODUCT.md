# RoadGuard AI

## One-liner

RoadGuard AI turns a citizen's road photo into a verified, prioritised, evidence-backed repair order that a municipal inspector can act on, and that the public can watch until it is closed.

## Audience

- **Ward engineers and road inspectors** (Inspector Console). They have a backlog, a budget and a crew. They need to know what to fix first, where it is, what it will cost, and to have a paper trail that survives an RTI request.
- **Citizens, commuters and dashcam volunteers** (Citizen app, WhatsApp). They have a phone and a grievance. They need a report to take under a minute and to see that somebody acted on it.
- **Examiners and judges** (landing page, README, model card). They have two minutes. They need to see the model working on a real road, real numbers, and a one-click way to run it.

## The three jobs

1. **Detect.** A YOLO26 detector fine-tuned on RDD2022 (India, Japan, Czech, United States, China motorbike, 27,823 labelled images) finds potholes and longitudinal, transverse and alligator cracks. A crack-segmentation model measures crack length and coverage. Every number on the result comes from the photo.
2. **Decide.** Duplicate reports of the same hazard are merged with DBSCAN on GPS. Each hazard gets a severity from defect type, damaged area and road class, a CPWD-style repair estimate in rupees, and a deterioration forecast that accounts for the monsoon. The console ranks the backlog by what gets worse fastest.
3. **Deliver.** Each hazard can produce a complaint letter addressed to the right authority with the photo evidence, GPS, severity and cost attached, then moves through submitted, acknowledged, in progress and fixed on a public ledger. Ward and contractor accountability is computed from that ledger, not typed in.

## Signature moment

**The Inspector's Mark.** Road inspectors in India mark potholes on the asphalt with a spray-paint circle and a chalk note. On the landing page a real Indian road photograph is shown as taken; drag the handle and RoadGuard's actual detections appear sprayed onto the road, each with its field note (defect, confidence, severity, rupee estimate) and its position on a chainage ruler. Drop your own photo on it and the live model marks that one.

## Explicitly out of scope

- Production hosting, a real database, real user accounts and municipal system integration.
- Live Twilio/ngrok setup (the WhatsApp webhook stays in the codebase and works when configured).
- Building, pipeline and bridge "sectors" from the hackathon: RoadGuard is about roads. The colour-threshold "leak", "corrosion" and "pipe break" detectors are removed because they fired on sky and shadows.
- Claims the data does not support. Every metric shown in the product is measured and dated.
