// A preset supplies timing, hardware cues and an ordered list of motion primitives.
const MechanicalArmPresets = (() => {
  const sweep = [0.16, 1, 0.3, 1];
  const slide = { mode: "slide", duration: 180, easing: [0.08, 0.92, 0.24, 1] };
  const home = { duration: 450, easing: [0.4, 0, 0.2, 1] };
  const deal = {
    chain: "cards",
    lamp: "#4bcb9d",
    release: slide,
    home,
    phases: [
      { kind: "pickup", duration: 120, chainedDuration: 25, dip: 4, hatch: true },
      { kind: "travel", duration: 300, easing: sweep, bend: 33, chainedBend: 64,
        lift: 27, shortOf: 44, releaseAt: 0.88 },
      { kind: "brake", duration: 86, rebound: 1.5 },
    ],
  };
  return {
    active: {
      deal,
      reveal: { ...deal, lamp: "#dfa054" },
      fold: {
        lamp: "#e38b4f",
        release: { mode: "none" },
        home,
        phases: [
          { kind: "travel", duration: 370, easing: [0.25, 0.85, 0.35, 1], bend: 38, lift: 16 },
          { kind: "brake", duration: 90, rebound: 1.3 },
          { kind: "release" },
          { kind: "hold", duration: 340 },
        ],
      },
    },
    // A caller can register this example with the same generic controller and supply a payload.
    giftExample: {
      lamp: "#e8ae59",
      release: { mode: "drop", duration: 270, arcHeight: 14, easing: [0.25, 0.45, 0.45, 1] },
      home: { duration: 500, easing: [0.4, 0, 0.2, 1] },
      phases: [
        { kind: "pickup", duration: 220, dip: 3, hatch: true },
        { kind: "travel", duration: 450, easing: [0.25, 1, 0.35, 1], bend: 62, lift: 34, angle: 0, shortOf: 18 },
        { kind: "hold", duration: 300, bob: 3 },
        { kind: "release" },
      ],
    },
  };
})();
