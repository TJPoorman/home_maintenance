import {
    mdiCheckCircleOutline,
    mdiDelete,
    mdiPencil,
    mdiDotsHorizontal,
} from "@mdi/js";
import { LitElement, html, nothing } from "lit";
import { property, state, query } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import { formatDateNumeric } from "custom-card-helpers";

import { localize } from '../localize/localize';
import { VERSION } from "./const";
import { loadConfigDashboard } from "./helpers";
import { commonStyle } from './styles'
import { EntityRegistryEntry, IntegrationConfig, IntervalType, INTERVAL_TYPES, getIntervalTypeLabels, Label, Task, Tag, TriggerType } from './types';
import { completeTask, getConfig, incrementCount, resetCount, loadLabelRegistry, loadRegistryEntries, loadTags, loadTask, loadTasks, removeTask, saveTask, updateTask } from './data/websockets';

interface TaskFormData {
    title: string;
    trigger_type: TriggerType;
    interval_value: number | "";
    interval_type: string;
    last_performed: string;
    icon: string;
    label: string[];
    tag: string;
    count_entity_id: string;
    count_threshold: number | "";
    runtime_entity_id: string;
    runtime_threshold: number | "";
}

export class HomeMaintenancePanel extends LitElement {
    @property() hass?: HomeAssistant;
    @property() narrow!: boolean;

    @state() private tags: Tag[] | null = null;
    @state() private tasks: Task[] = [];
    @state() private config: IntegrationConfig | null = null;
    @state() private registry: EntityRegistryEntry[] = [];
    @state() private labelRegistry: Label[] = [];

    // New Task form state
    @state() private _formData: TaskFormData = {
        title: "",
        trigger_type: "time",
        interval_value: "",
        interval_type: "days",
        last_performed: "",
        icon: "",
        label: [],
        tag: "",
        count_entity_id: "",
        count_threshold: "",
        runtime_entity_id: "",
        runtime_threshold: "",
    };
    private _advancedOpen: boolean = false;

    // Edit dialog state
    @state() private _editingTaskId: string | null = null;
    @state() private _editFormData: TaskFormData = {
        title: "",
        trigger_type: "time",
        interval_value: "",
        interval_type: "days",
        last_performed: "",
        icon: "",
        label: [],
        tag: "",
        count_entity_id: "",
        count_threshold: "",
        runtime_entity_id: "",
        runtime_threshold: "",
    };

    // Shared overflow menu state
    @state() private _selectedTaskId: string | null = null;
    @query("#actions-menu") private _actionsMenu?: any;

    private get _columns() {
        return {
            icon: {
                title: "",
                moveable: false,
                showNarrow: false,
                label: "icon",
                type: "icon",
                template: (task: Task) =>
                    task.icon ? html`<ha-icon .icon=${task.icon}></ha-icon>` : nothing,
            },
            tagIcon: {
                title: "",
                moveable: false,
                showNarrow: false,
                label: "tag",
                type: "icon",
                template: (task: any) =>
                    task.tagIcon ? html`<ha-icon .icon=${task.tagIcon}></ha-icon>` : nothing,
            },
            title: {
                title: 'Title',
                main: true,
                showNarrow: true,
                sortable: true,
                filterable: true,
                grows: true,
                extraTemplate: (task: Task) => {
                    const entity = this.registry.find((entry) => entry.unique_id === task.id);
                    if (!entity) return nothing;

                    const labels = this.labelRegistry.filter((lr) => entity.labels.includes(lr.label_id));

                    return labels.length
                        ? html`<ha-data-table-labels .labels=${labels}></ha-data-table-labels>`
                        : nothing;
                },
            },
            interval_days: {
                title: 'Interval',
                showNarrow: false,
                sortable: true,
                minWidth: "100px",
                maxWidth: "100px",
                template: (task: any) => {
                    if (task.trigger_type === "count") {
                        return `${task.current_count} / ${task.count_threshold}`;
                    }
                    if (task.trigger_type === "runtime") {
                        return `${task.runtime_delta ?? 0} / ${task.runtime_threshold ?? 0}`;
                    }
                    const type = task.interval_type;
                    const isSingular = task.interval_value === 1;
                    const labelKey = isSingular ? type.slice(0, -1) : type;
                    return `${task.interval_value} ${localize(`intervals.${labelKey}`, this.hass!.language)}`;
                }
            },
            last_performed: {
                title: 'Last Performed',
                showNarrow: false,
                sortable: true,
                minWidth: "150px",
                maxWidth: "150px",
                template: (task: any) => {
                    if (task.trigger_type === "count" || task.trigger_type === "runtime") return "-";
                    if (!task.last_performed) return "-";

                    const date = new Date(this.computeISODate(task.last_performed));
                    return formatDateNumeric(date, this.hass!.locale);
                }
            },
            next_due: {
                title: localize('panel.cards.current.next', this.hass!.language),
                showNarrow: true,
                sortable: true,
                direction: "asc",
                minWidth: "100px",
                maxWidth: "100px",
                template: (task: any) => {
                    if (task.trigger_type === "count") {
                        const isDue = (task.current_count ?? 0) >= (task.count_threshold ?? 0);
                        return html`
                            <span style=${isDue ? "color: var(--error-color, red); font-weight: bold;" : ""}>
                                ${task.current_count ?? 0} / ${task.count_threshold ?? 0}
                            </span>`;
                    }

                    if (task.trigger_type === "runtime") {
                        const delta = task.runtime_delta ?? 0;
                        const threshold = task.runtime_threshold ?? 0;
                        const isDue = threshold > 0 && delta >= threshold;
                        return html`
                            <span style=${isDue ? "color: var(--error-color, red); font-weight: bold;" : ""}>
                                ${delta} / ${threshold}
                            </span>`;
                    }

                    const now = new Date();
                    const next = new Date(task.next_due);
                    const isDue = next <= now;

                    return html`
                        <span style=${isDue ? "color: var(--error-color, red); font-weight: bold;" : ""}>
                            ${formatDateNumeric(next, this.hass!.locale)}
                        </span>` || "—";
                },
            },
            complete: {
                minWidth: "64px",
                maxWidth: "64px",
                sortable: false,
                groupable: false,
                showNarrow: true,
                moveable: false,
                hideable: false,
                type: "overflow",
                template: (task: Task) => html`
                <ha-icon-button
                    @click=${() => this._handleCompleteTaskClick(task.id)}
                    .label="Complete"
                    title="Mark Task Complete"
                    .path=${mdiCheckCircleOutline}
                ></ha-icon-button>
              `,
            },
            actions: {
                title: "",
                label: "actions",
                showNarrow: true,
                moveable: false,
                hideable: false,
                type: "overflow-menu",
                template: (task: Task) => html`
                    <ha-icon-button
                        @click=${(e: Event) => this._handleShowMenu(task.id, e)}
                        .label="Actions"
                        title="Actions"
                        .path=${mdiDotsHorizontal}
                    ></ha-icon-button>
                `,
            },
        }
    };

    private get _columnsToDisplay() {
        return Object.fromEntries(
            Object.entries(this._columns).filter(([_, col]) =>
                this.narrow ? col.showNarrow !== false : true
            )
        );
    }

    private get _rows() {
        return this.tasks.map((task: Task) => ({
            icon: task.icon,
            id: task.id,
            title: task.title,
            interval_value: task.interval_value,
            interval_type: task.interval_type,
            last_performed: task.last_performed ?? 'Never',
            trigger_type: task.trigger_type ?? "time",
            count_entity_id: task.count_entity_id,
            count_threshold: task.count_threshold ?? 0,
            current_count: task.current_count ?? 0,
            runtime_entity_id: task.runtime_entity_id,
            runtime_threshold: task.runtime_threshold ?? 0,
            runtime_baseline: task.runtime_baseline ?? 0,
            runtime_delta: (() => {
                if (task.trigger_type !== "runtime" || !task.runtime_entity_id) return 0;
                const sensorState = this.hass?.states?.[task.runtime_entity_id];
                if (!sensorState || sensorState.state === "unknown" || sensorState.state === "unavailable") return 0;
                const current = parseFloat(sensorState.state);
                if (isNaN(current)) return 0;
                const baseline = task.runtime_baseline ?? 0;
                const delta = current < baseline ? current : current - baseline;
                return Math.round(delta * 100) / 100;
            })(),
            interval_days: (() => {
                if (task.trigger_type === "runtime") {
                    return task.runtime_threshold ? task.runtime_threshold : Number.MAX_SAFE_INTEGER;
                }
                if (task.trigger_type === "count") {
                    // Sort count-based tasks by how close they are to threshold
                    return task.count_threshold ? (task.count_threshold - (task.current_count ?? 0)) : Number.MAX_SAFE_INTEGER;
                }
                switch (task.interval_type) {
                    case "days":
                        return task.interval_value;
                    case "weeks":
                        return task.interval_value * 7;
                    case "months":
                        return task.interval_value * 30;
                    default:
                        return Number.MAX_SAFE_INTEGER;
                }
            })(),
            next_due: (() => {
                if (task.trigger_type === "runtime") {
                    const sensorState = this.hass?.states?.[task.runtime_entity_id ?? ""];
                    if (!sensorState) return new Date(9999, 0, 1);
                    const current = parseFloat(sensorState.state);
                    if (isNaN(current)) return new Date(9999, 0, 1);
                    const baseline = task.runtime_baseline ?? 0;
                    const delta = current < baseline ? current : current - baseline;
                    const isDue = (task.runtime_threshold ?? 0) > 0 && delta >= (task.runtime_threshold ?? 0);
                    return isDue ? new Date(0) : new Date(9999, 0, 1);
                }
                if (task.trigger_type === "count") {
                    // For sorting: use a far-future date if not due, past date if due
                    const isDue = (task.current_count ?? 0) >= (task.count_threshold ?? 0);
                    return isDue ? new Date(0) : new Date(9999, 0, 1);
                }
                const [datePart] = task.last_performed.split("T");
                const [year, month, day] = datePart.split("-").map(Number);
                const next = new Date(year, month - 1, day);

                switch (task.interval_type) {
                    case "days":
                        next.setDate(next.getDate() + task.interval_value);
                        break;
                    case "weeks":
                        next.setDate(next.getDate() + task.interval_value * 7);
                        break;
                    case "months":
                        next.setMonth(next.getMonth() + task.interval_value);
                        break;
                    default:
                        throw new Error(`Unsupported interval type: ${task.interval_type}`);
                }

                return next;
            })(),
            tagIcon: (() => task.tag_id && task.tag_id.trim() !== "" ? "mdi:tag" : undefined)(),
        }));
    }

    private get _basicSchema() {
        const triggerType = this._formData.trigger_type;
        const schema: any[] = [
            { name: "title", required: true, selector: { text: {} }, },
            {
                name: "trigger_type",
                required: true,
                selector: {
                    select: {
                        options: [
                            { value: "time", label: "Time-based" },
                            { value: "count", label: "Count-based" },
                            { value: "runtime", label: "Runtime-based" },
                        ],
                        mode: "dropdown"
                    },
                },
            },
        ];

        if (triggerType === "count") {
            schema.push(
                { name: "count_entity_id", required: true, selector: { entity: {} }, },
                { name: "count_threshold", required: true, selector: { number: { min: 1, mode: "box" } }, },
            );
        } else if (triggerType === "runtime") {
            schema.push(
                { name: "runtime_entity_id", required: true, selector: { entity: { filter: { domain: "sensor" } } }, },
                { name: "runtime_threshold", required: true, selector: { number: { min: 0.1, step: 0.1, mode: "box" } }, },
            );
        } else {
            schema.push(
                { name: "interval_value", required: true, selector: { number: { min: 1, mode: "box" } }, },
                {
                    name: "interval_type",
                    required: true,
                    selector: {
                        select: {
                            options: INTERVAL_TYPES.map((type) => ({
                                value: type,
                                label: getIntervalTypeLabels(this.hass!.language)[type],
                            })),
                            mode: "dropdown"
                        },
                    },
                },
            );
        }

        return schema;
    };

    private get _advancedSchema() {
        return [
            { name: "last_performed", selector: { date: {} }, },
            { name: "icon", selector: { icon: {} }, },
            { name: "label", selector: { label: { multiple: true } }, },
            { name: "tag", selector: { entity: { filter: { domain: "tag" } } }, },
        ]
    };

    private get _editSchema() {
        const triggerType = this._editFormData.trigger_type;
        const schema: any[] = [
            {
                name: "trigger_type",
                required: true,
                selector: {
                    select: {
                        options: [
                            { value: "time", label: "Time-based" },
                            { value: "count", label: "Count-based" },
                            { value: "runtime", label: "Runtime-based" },
                        ],
                        mode: "dropdown"
                    },
                },
            },
        ];

        if (triggerType === "count") {
            schema.push(
                { name: "count_entity_id", required: true, selector: { entity: {} }, },
                { name: "count_threshold", required: true, selector: { number: { min: 1, mode: "box" } }, },
            );
        } else if (triggerType === "runtime") {
            schema.push(
                { name: "runtime_entity_id", required: true, selector: { entity: { filter: { domain: "sensor" } } }, },
                { name: "runtime_threshold", required: true, selector: { number: { min: 0.1, step: 0.1, mode: "box" } }, },
            );
        } else {
            schema.push(
                { name: "interval_value", required: true, selector: { number: { min: 1, mode: "box" } }, },
                {
                    name: "interval_type",
                    required: true,
                    selector: {
                        select: {
                            options: INTERVAL_TYPES.map((type) => ({
                                value: type,
                                label: getIntervalTypeLabels(this.hass!.language)[type],
                            })),
                            mode: "dropdown"
                        },
                    },
                },
            );
        }

        schema.push(
            { type: "constant", name: localize('panel.dialog.edit_task.sections.optional', this.hass!.language), disabled: true },
            { name: "last_performed", selector: { date: {} }, },
            { name: "icon", selector: { icon: {} }, },
            { name: "label", selector: { label: { multiple: true } }, },
            { name: "tag", selector: { entity: { filter: { domain: "tag" } } }, },
        );

        return schema;
    };

    private _computeLabel = (schema: { name: string }): string => {
        try {
            return localize(`panel.cards.new.fields.${schema.name}.heading`, this.hass!.language) ?? schema.name;
        } catch {
            return schema.name;
        }
    }

    private _computeHelper = (schema: { name: string }): string => {
        try {
            return localize(`panel.cards.new.fields.${schema.name}.helper`, this.hass!.language) ?? "";
        } catch {
            return "";
        }
    }

    private _computeEditLabel = (schema: { name: string }): string => {
        try {
            return localize(`panel.dialog.edit_task.fields.${schema.name}.heading`, this.hass!.language) ?? schema.name;
        } catch {
            return schema.name;
        }
    }

    private _computeEditHelper = (schema: { name: string }): string => {
        try {
            return localize(`panel.dialog.edit_task.fields.${schema.name}.helper`, this.hass!.language) ?? "";
        } catch {
            return "";
        }
    }

    private async loadData() {
        await loadConfigDashboard();
        this.tags = await loadTags(this.hass!);
        this.tasks = await loadTasks(this.hass!);
        this.config = await getConfig(this.hass!);
        this.registry = await loadRegistryEntries(this.hass!);
        this.labelRegistry = await loadLabelRegistry(this.hass!);
    }

    private async resetForm() {
        this._formData = {
            title: "",
            trigger_type: "time",
            interval_value: "",
            interval_type: "days",
            last_performed: "",
            icon: "",
            label: [],
            tag: "",
            count_entity_id: "",
            count_threshold: "",
            runtime_entity_id: "",
            runtime_threshold: "",
        };

        this.tasks = await loadTasks(this.hass!);
    }

    private async resetEditForm() {
        this._editFormData = {
            title: "",
            trigger_type: "time",
            interval_value: "",
            interval_type: "days",
            last_performed: "",
            icon: "",
            label: [],
            tag: "",
            count_entity_id: "",
            count_threshold: "",
            runtime_entity_id: "",
            runtime_threshold: "",
        };
    }

    private computeISODate(dateStr: string): string {
        let isoDateStr: string;

        if (dateStr) {
            // Only take the YYYY-MM-DD part to avoid time zone issues
            const [yearStr, monthStr, dayStr] = dateStr.split("T")[0].split("-");
            const year = Number(yearStr);
            const month = Number(monthStr);
            const day = Number(dayStr);

            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                const parsedDate = new Date(year, month - 1, day);
                parsedDate.setHours(0, 0, 0, 0);
                isoDateStr = parsedDate.toISOString();
            } else {
                alert("Invalid date entered.");
                const fallback = new Date();
                fallback.setHours(0, 0, 0, 0);
                isoDateStr = fallback.toISOString();
            }
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            isoDateStr = today.toISOString();
        }

        return isoDateStr;
    }

    connectedCallback() {
        super.connectedCallback();
        this.loadData();
    }

    render() {
        if (!this.hass) return html``;

        if (!this.tasks || !this.tags) {
            return html`<p>${localize('common.loading', this.hass.language)}</p>`;
        }

        return html`
            <div class="header">
                <div class="toolbar">
                    <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
                    <div class="main-title">
                        ${this.config?.options.sidebar_title}
                    </div>
                    <div class="version">
                        v${VERSION}
                    </div>
                </div>
            </div>

            <div class="view">
                <ha-card
                    header="${localize('panel.cards.new.title', this.hass.language)}"
                    class="card-new"
                >
                    <div class="card-content">${this.renderForm()}</div>
                </ha-card>

                <ha-card
                    header="${localize('panel.cards.current.title', this.hass.language)}"
                    class="card-current"
                >
                    <div class="card-content">${this.renderTasks()}</div>
                </ha-card>
            </div>

            ${this.renderEditDialog()}
            ${this.renderActionsMenu()}
        `;
    }

    renderForm() {
        if (!this.hass) return html``;

        return html`
            <ha-form
                .hass=${this.hass}
                .schema=${this._basicSchema}
                .computeLabel=${this._computeLabel.bind(this)}
                .computeHelper=${this._computeHelper.bind(this)}
                .data=${this._formData}
                @value-changed=${(e: CustomEvent) => this._handleFormValueChanged(e)}
            ></ha-form>

            <ha-expansion-panel
                header="${localize('panel.cards.new.sections.optional', this.hass.language)}"
                .opened=${this._advancedOpen}
                @opened-changed=${(e: CustomEvent) => (this._advancedOpen = e.detail.value)}
            >
                <ha-form
                    .hass=${this.hass}
                    .data=${this._formData}
                    .schema=${this._advancedSchema}
                    .computeLabel=${this._computeLabel.bind(this)}
                    .computeHelper=${this._computeHelper.bind(this)}
                    @value-changed=${(e: CustomEvent) => this._handleFormValueChanged(e)}
                ></ha-form>
            </ha-expansion-panel>

            <div class="form-field">
                <mwc-button @click=${this._handleAddTaskClick}>
                    ${localize('panel.cards.new.actions.add_task', this.hass.language)}
                </mwc-button>
            </div>
        `;
    }

    renderTasks() {
        if (!this.hass) return html``;

        if (!this.tasks || this.tasks.length === 0) {
            return html`<span>${localize('common.no_tasks', this.hass!.language)}</span>`;
        }

        return html`
            <div class="table-wrapper">
                <ha-data-table
                    .hass=${this.hass}
                    .columns=${this._columnsToDisplay}
                    .data=${this._rows}
                    .narrow=${this.narrow}
                    auto-height
                    id="tasks-table"
                    class="tasks-table"
                    clickable
                >
                </ha-data-table>
            </div>
        `;
    }

    renderEditDialog() {
        if (!this.hass) return html``;

        if (!this._editingTaskId) return html``;

        return html`
            <ha-dialog
                open
                heading="${localize('panel.dialog.edit_task.title', this.hass.language)}: ${this._editFormData.title}"
                @closed=${this._handleDialogClosed}
            >
                <ha-form
                    .hass=${this.hass}
                    .schema=${this._editSchema}
                    .computeLabel=${this._computeEditLabel.bind(this)}
                    .computeHelper=${this._computeEditHelper.bind(this)}
                    .data=${this._editFormData}
                    @value-changed=${(e: CustomEvent) => this._handleEditFormValueChanged(e)}
                ></ha-form>

                <mwc-button slot="secondaryAction" @click=${() => (this._editingTaskId = null)}>
                    ${localize('panel.dialog.edit_task.actions.cancel', this.hass.language)}
                </mwc-button>
                <mwc-button slot="primaryAction" @click=${this._handleSaveEditClick}>
                    ${localize('panel.dialog.edit_task.actions.save', this.hass.language)}
                </mwc-button>
            </ha-dialog>
        `;
    }

    renderActionsMenu() {
        if (!this.hass) return html``;

        return html`
            <ha-md-menu id="actions-menu" positioning="fixed">
                <ha-md-menu-item
                    @click=${() => {
                if (this._selectedTaskId) {
                    this._handleOpenEditDialogClick(this._selectedTaskId);
                }
            }}
                >
                    <ha-svg-icon slot="start" path=${mdiPencil}></ha-svg-icon>
                    ${localize('panel.cards.current.actions.edit', this.hass!.language)}
                </ha-md-menu-item>
                <ha-md-menu-item
                    @click=${() => {
                if (this._selectedTaskId) {
                    this._handleRemoveTaskClick(this._selectedTaskId);
                }
            }}
                >
                    <ha-svg-icon slot="start" path=${mdiDelete}></ha-svg-icon>
                    ${localize('panel.cards.current.actions.remove', this.hass!.language)}
                </ha-md-menu-item>
            </ha-md-menu>
        `;
    }

    private async _handleAddTaskClick() {
        const { title, trigger_type, interval_value, interval_type, last_performed, tag, icon, label, count_entity_id, count_threshold, runtime_entity_id, runtime_threshold } = this._formData;

        const isCount = trigger_type === "count";
        const isRuntime = trigger_type === "runtime";

        if (!title?.trim()) {
            const msg = localize("panel.cards.new.alerts.required", this.hass!.language);
            alert(msg);
            return;
        }

        if (isCount && (!count_entity_id?.trim() || !count_threshold)) {
            const msg = localize("panel.cards.new.alerts.required", this.hass!.language);
            alert(msg);
            return;
        }

        if (isRuntime && (!runtime_entity_id?.trim() || !runtime_threshold)) {
            const msg = localize("panel.cards.new.alerts.required", this.hass!.language);
            alert(msg);
            return;
        }

        if (!isCount && !isRuntime && (!interval_value || !interval_type)) {
            const msg = localize("panel.cards.new.alerts.required", this.hass!.language);
            alert(msg);
            return;
        }

        const payload: Record<string, any> = {
            title: title.trim(),
            interval_value: (isCount || isRuntime) ? 1 : interval_value,
            interval_type: (isCount || isRuntime) ? "days" : interval_type,
            last_performed: this.computeISODate(last_performed),
            tag_id: tag?.trim() || undefined,
            icon: icon?.trim() || "mdi:calendar-check",
            labels: label ?? [],
            trigger_type: trigger_type || "time",
        };

        if (isCount) {
            payload.count_entity_id = count_entity_id?.trim();
            payload.count_threshold = Number(count_threshold);
        }

        if (isRuntime) {
            payload.runtime_entity_id = runtime_entity_id?.trim();
            payload.runtime_threshold = Number(runtime_threshold);
        }

        try {
            await saveTask(this.hass!, payload);
            await this.resetForm();
        } catch (error) {
            console.error("Failed to add task:", error);
            const msg = localize('panel.cards.new.alerts.error', this.hass!.language)
            alert(msg);
        }
    };

    private async _handleCompleteTaskClick(id: string) {
        try {
            await completeTask(this.hass!, id);
            await this.loadData();
        } catch (e) {
            console.error("Failed to complete task:", e);
        }
    }

    private async _handleOpenEditDialogClick(id: string) {
        try {
            const task: Task = await loadTask(this.hass!, id);
            this._editingTaskId = task.id;
            let labels: Label[] = [];
            const entity = this.registry.find((entry) => entry.unique_id === task.id);
            if (entity)
                labels = this.labelRegistry.filter((lr) => entity.labels.includes(lr.label_id));

            this._editFormData = {
                title: task.title,
                trigger_type: task.trigger_type ?? "time",
                interval_value: task.interval_value,
                interval_type: task.interval_type,
                last_performed: task.last_performed ?? "",
                icon: task.icon ?? "",
                label: labels.map((l) => l.label_id),
                tag: task.tag_id ?? "",
                count_entity_id: task.count_entity_id ?? "",
                count_threshold: task.count_threshold ?? "",
                runtime_entity_id: task.runtime_entity_id ?? "",
                runtime_threshold: task.runtime_threshold ?? "",
            };

            await this.updateComplete;
        } catch (e) {
            console.error("Failed to fetch task for edit:", e);
        }
    }

    private async _handleSaveEditClick() {
        if (!this._editingTaskId) return;

        const lastPerformedISO = this.computeISODate(this._editFormData.last_performed);
        if (!lastPerformedISO) return;

        const isCount = this._editFormData.trigger_type === "count";
        const isRuntime = this._editFormData.trigger_type === "runtime";
        const updates: Record<string, any> = {
            title: this._editFormData.title.trim(),
            trigger_type: this._editFormData.trigger_type || "time",
            interval_value: (isCount || isRuntime) ? 1 : Number(this._editFormData.interval_value),
            interval_type: (isCount || isRuntime) ? "days" : this._editFormData.interval_type,
            last_performed: lastPerformedISO,
            icon: this._editFormData.icon?.trim() || "mdi:calendar-check",
            labels: this._editFormData.label,
            count_entity_id: isCount ? (this._editFormData.count_entity_id?.trim() || null) : null,
            count_threshold: isCount ? Number(this._editFormData.count_threshold) : 0,
            runtime_entity_id: isRuntime ? (this._editFormData.runtime_entity_id?.trim() || null) : null,
            runtime_threshold: isRuntime ? Number(this._editFormData.runtime_threshold) : 0,
        };

        if (this._editFormData.tag && this._editFormData.tag.trim() !== "") {
            updates.tag_id = this._editFormData.tag.trim();
        } else {
            updates.tag_id = null;
        }

        const payload = {
            task_id: this._editingTaskId,
            updates,
        };

        try {
            await updateTask(this.hass!, payload);
            this._editingTaskId = null;
            await this.resetEditForm();
            await this.loadData();
        } catch (e) {
            console.error("Failed to update task:", e);
        }
    }

    private async _handleRemoveTaskClick(id: string) {
        const msg = localize('panel.cards.current.confirm_remove', this.hass!.language)
        if (!confirm(msg)) return;
        try {
            await removeTask(this.hass!, id);
            await this.loadData();
        } catch (e) {
            console.error("Failed to remove task:", e);
        }
    }

    private _handleDialogClosed(e: CustomEvent) {
        const action = e.detail?.action;
        if (action === "close" || action === "cancel") {
            this._editingTaskId = null;
        }
    }

    private _handleFormValueChanged(ev: CustomEvent) {
        this._formData = { ...this._formData, ...ev.detail.value };
    }

    private _handleEditFormValueChanged(ev: CustomEvent) {
        this._editFormData = { ...this._editFormData, ...ev.detail.value };
    }

    private _handleShowMenu(taskId: string, ev: Event) {
        this._selectedTaskId = taskId;

        if (!this._actionsMenu) {
            return;
        }

        this._actionsMenu.anchorElement = ev.currentTarget as HTMLElement;
        this._actionsMenu.show();

        ev.stopPropagation();
    } static styles = commonStyle;
}

customElements.define("home-maintenance-panel", HomeMaintenancePanel);
