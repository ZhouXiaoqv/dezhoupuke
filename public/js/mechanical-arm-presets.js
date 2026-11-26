// A preset supplies timing, hardware cues and an ordered list of motion primitives.
const MechanicalArmPresets = (() => {
  const home = { duration: 450, easing: [0.4, 0, 0.2, 1] };
  const deal = {
    lamp: "#4bcb9d",
    release: { mode: "place", duration: 150, easing: [.32, .08, .27, 1] },
    home,
    phases: [
      { kind: "stageOutlet", duration: 175, feedDuration: 140, exposed: .57, clearance: 27 },
      { kind: "gripOutlet", duration: 92, grip: 62 },
      { kind: "retractOutlet", duration: 68 },
      { kind: "extractOutlet", duration: 106 },
      { kind: "preparePlacement", duration: 267, lift: 19 },
      { kind: "placePayload", duration: 98 },
      { kind: "hold", duration: 34 },
    ],
  };
  return {
    active: {
      deal,
      reveal: { ...deal, lamp: "#dfa054" },
      receipt: {
        lamp: "#dfad66",
        release: { mode: "none" },
        home,
        phases: [
          { kind: "stageOutlet", duration: 175, feedDuration: 240, feedSteps: 9, exposed: .30, clearance: 22 },
          { kind: "gripOutlet", duration: 120, grip: 60 },
          { kind: "retractOutlet", duration: 76 },
          { kind: "extractOutlet", duration: 164 },
          { kind: "release", duration: 46 },
        ],
      },
      fold: {
        lamp: "#e38b4f",
        release: { mode: "recycle", duration: 360 },
        home,
        phases: [
          { kind: "pickup", duration: 280, grip: 65 },
          { kind: "travel", duration: 282, easing: [0.25, 0.85, 0.35, 1], jointPath: true, lift: 10,
            approach: true, scaleTo: 1, scaleDuration: 165 },
          { kind: "feedRecycler", duration: 104 },
          { kind: "recycle", duration: 108 },
        ],
      },
    },
    // A caller can register this example with the same generic controller and supply a payload.
    giftExample: {
      lamp: "#e8ae59",
      releaseLamp: "#cf9bc3",
      release: { mode: "drop", duration: 270, arcHeight: 14, easing: [0.25, 0.45, 0.45, 1] },
      home: { duration: 500, easing: [0.4, 0, 0.2, 1] },
      phases: [
        { kind: "pickup", duration: 220, dip: 3, hatch: true },
        { kind: "travel", duration: 450, easing: [0.25, 1, 0.35, 1], bend: 62, lift: 34, wristAngle: 0, shortOf: 18 },
        { kind: "hold", duration: 300, bob: 3 },
        { kind: "release" },
      ],
    },
  };
})();
