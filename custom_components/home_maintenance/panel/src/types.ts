import { localize } from '../localize/localize'

export type IntervalType = "days" | "weeks" | "months";

export const INTERVAL_TYPES: IntervalType[] = ["days", "weeks", "months"];

export function getIntervalTypeLabels(lang: string): Record<IntervalType, string> {
    return {
        days: localize("intervals.days", lang),
        weeks: localize("intervals.weeks", lang),
        months: localize("intervals.months", lang),
    };
}

export interface IntegrationConfig {
    data: Record<string, any>;
    options: Record<string, any>;
}

export interface Label {
    label_id: string;
    name: string;
    color?: string;
    icon?: string;
}

export interface Tag {
    id: string;
    name?: string;
}

export interface EntityRegistryEntry {
    entity_id: string;
    unique_id: string;
    platform: string;
    device_id?: string;
    disabled_by?: string | null;
    area_id?: string | null;
    original_name?: string;
    icon?: string;
    labels: string[];
}

export type TriggerType = "time" | "count" | "runtime";

export interface Task {
    id: string;
    title: string;
    interval_value: number;
    interval_type: IntervalType;
    last_performed: string;
    tag_id?: string;
    icon?: string;
    trigger_type?: TriggerType;
    count_entity_id?: string;
    count_threshold?: number;
    current_count?: number;
    runtime_entity_id?: string;
    runtime_threshold?: number;
    runtime_baseline?: number;
}