export function generateHoles(courseId: string, holesCount: number, parTotal: number) {
  // Build a sensible par distribution
  const pars = buildParDistribution(holesCount, parTotal);
  return pars.map((par, i) => ({
    course_id: courseId,
    hole_number: i + 1,
    par,
    stroke_index: i + 1, // 1–18 in order, good enough default
    distance_m: null,
  }));
}

function buildParDistribution(n: number, total: number): number[] {
  // Start with all par 4s, then swap to 3s and 5s to hit the target total
  const pars = Array(n).fill(4);
  let diff = total - n * 4;

  // Standard patterns for 9 and 18 holes
  if (n === 18) {
    // Typical layout: 4×par3, 10×par4, 4×par5
    const threeSlots = [2, 5, 11, 15]; // 0-indexed holes that become par 3
    const fiveSlots  = [4, 8, 12, 16]; // holes that become par 5

    if (diff === 0) {
      // par 72 — standard
      threeSlots.forEach((i) => (pars[i] = 3));
      fiveSlots.forEach((i) => (pars[i] = 5));
    } else if (diff > 0) {
      // More par 5s needed (par > 72)
      threeSlots.forEach((i) => (pars[i] = 3));
      fiveSlots.forEach((i) => (pars[i] = 5));
      let extra = diff;
      for (let i = 0; i < n && extra > 0; i++) {
        if (pars[i] === 4) { pars[i] = 5; extra--; }
      }
    } else {
      // Fewer par 5s / more par 3s (par < 72)
      threeSlots.forEach((i) => (pars[i] = 3));
      fiveSlots.forEach((i) => (pars[i] = 5));
      let deficit = -diff;
      for (let i = n - 1; i >= 0 && deficit > 0; i--) {
        if (pars[i] === 5) { pars[i] = 4; deficit--; }
      }
      for (let i = n - 1; i >= 0 && deficit > 0; i--) {
        if (pars[i] === 4) { pars[i] = 3; deficit--; }
      }
    }
  } else if (n === 9) {
    const threeSlots = [2, 5];
    const fiveSlots  = [4, 8];
    threeSlots.forEach((i) => (pars[i] = 3));
    fiveSlots.forEach((i) => (pars[i] = 5));
    let extra = total - pars.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n && extra > 0; i++) {
      if (pars[i] === 4) { pars[i] = 5; extra--; }
    }
    for (let i = n - 1; i >= 0 && extra < 0; i--) {
      if (pars[i] === 5) { pars[i] = 4; extra++; }
      else if (pars[i] === 4) { pars[i] = 3; extra++; }
    }
  } else {
    // Generic: distribute 3s and 5s evenly
    let remaining = diff;
    for (let i = 0; i < n && remaining > 0; i += 3) { pars[i] = 5; remaining--; }
    for (let i = 1; i < n && remaining < 0; i += 3) { pars[i] = 3; remaining++; }
  }

  return pars;
}
