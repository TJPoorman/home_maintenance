import { EntityRegistryEntry, Tag, Task, IntegrationConfig, Label } from '../types';
import type { HomeAssistant } from "custom-card-helpers";

export const loadTags = (hass: HomeAssistant): Promise<Tag[]> =>
    hass.connection.sendMessagePromise<Tag[]>({
        type: 'tag/list',
    });

export const loadRegistryEntries = (hass: HomeAssistant): Promise<EntityRegistryEntry[]> =>
    hass.callWS({
        type: "config/entity_registry/list",
    });

export const loadLabelRegistry = (hass: HomeAssistant): Promise<Label[]> =>
    hass.callWS({
        type: "config/label_registry/list",
    });

export const loadTasks = (hass: HomeAssistant): Promise<Task[]> =>
    hass.callWS({
        type: 'home_maintenance/get_tasks',
    });

export const loadTask = (hass: HomeAssistant, id: string): Promise<Task> =>
    hass.callWS({
        type: 'home_maintenance/get_task',
        task_id: id,
    })

export const saveTask = (hass: HomeAssistant, payload: Record<string, any>): Promise<void> =>
    hass.callWS({
        type: 'home_maintenance/add_task',
        ...payload,
    })

export const removeTask = (hass: HomeAssistant, id: string): Promise<void> =>
    hass.callWS({
        type: 'home_maintenance/remove_task',
        task_id: id,
    });

export const completeTask = (hass: HomeAssistant, id: string): Promise<void> =>
    hass.callWS({
        type: 'home_maintenance/complete_task',
        task_id: id,
    })

export const updateTask = (hass: HomeAssistant, payload: Record<string, any>): Promise<void> =>
    hass.callWS({
        type: 'home_maintenance/update_task',
        ...payload,
    })

export const incrementCount = (hass: HomeAssistant, id: string): Promise<void> =>
    hass.callWS({
        type: 'home_maintenance/increment_count',
        task_id: id,
    })

export const resetCount = (hass: HomeAssistant, id: string): Promise<void> =>
    hass.callWS({
        type: 'home_maintenance/reset_count',
        task_id: id,
    })

export const getConfig = (hass: HomeAssistant): Promise<IntegrationConfig> =>
    hass.callWS({
        type: 'home_maintenance/get_config',
    })