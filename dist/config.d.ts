import { PresetName, RouterConfig } from "./types";
export declare class Config {
    private readonly raw;
    private readonly detectedPresets;
    constructor(raw: Partial<RouterConfig>, detectedPresets?: PresetName[]);
    get current(): RouterConfig;
    private array;
    private boolean;
    private positiveNumber;
    private clampedNumber;
    private strategy;
    private agents;
}
