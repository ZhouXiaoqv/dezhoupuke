// A preset supplies timing, hardware cues and an ordered list of motion primitives.
const MechanicalArmPresets = (() => {
  const sweep = [0.16, 1, 0.3, 1];
  const slide = { mode: "slide", duration: 180, easing: [0.08, 0.92, 0.24, 1] };
  const home = { duration: 450, easing: [0.4, 0, 0.2, 1] };
  const deal = {
    lamp: "#4bcb9d",
    release: slide,
    home,
    phases: [
      { kind: "stageCard", duration: 175, feedDuration: 140, exposed: .57, clearance: 27 },
      { kind: "pickupCard", duration: 118, grip: 62 },
      { kind: "extractCard", duration: 160 },
      { kind: "travel", duration: 260, easing: sweep, bend: 33,
        lift: 27, shortOf: 59, releaseAt: 0.93 },
    ],
  };
  return {
    active: {
      deal,
      reveal: { ...deal, lamp: "#dfa054" },
      fold: {
        lamp: "#e38b4f",
        release: { mode: "recycle", duration: 360 },
        home,
        phases: [
          { kind: "pickup", duration: 290, grip: 80 },
          { kind: "travel", duration: 270, easing: [0.25, 0.85, 0.35, 1], jointPath: true, lift: 10, standoff: 13 },
          { kind: "recycle", duration: 94 },
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
