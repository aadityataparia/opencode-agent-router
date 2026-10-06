import { PresetName, RouterConfig } from "./types";
export declare class Config {
    private readonly raw;
    detectedPresets: PresetName[];
    constructor(raw: Partial<RouterConfig>, detectedPresets?: PresetName[]);
    get current(): RouterConfig;
    private array;
    private boolean;
    private positiveNumber;
    private clampedNumber;
    private strategy;
    private agents;
}
