export const normalizePressure = (p: number) => {
    if (p === 0) return 1.0; // mouse fallback
    return Math.min(Math.max(p, 0.1), 1.0);
};

export const pressureCurve = (p: number, gamma: number) => Math.pow(p, gamma);

export const smoothPressure = (prev: number, curr: number) => prev * 0.7 + curr * 0.3;
