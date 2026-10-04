import { AgentRequirements, PresetName, RouterConfig, RoutingStrategy } from "./types";
export declare class Config {
    private readonly raw;
    private readonly detectedPresets;
    constructor(raw: Partial<RouterConfig>, detectedPresets?: PresetName[]);
    get current(): RouterConfig;
    array<T>(key: keyof RouterConfig): T[] | undefined;
    boolean(key: keyof RouterConfig, defaultValue: boolean): boolean;
    positiveNumber(key: keyof RouterConfig): number;
    clampedNumber(key: keyof RouterConfig, min: number, max: number): number;
    strategy(): RoutingStrategy;
    agents(): Record<string, AgentRequirements>;
}
