import { LitElement, css, html } from 'lit';
import type { HomeAssistant } from "custom-card-helpers";
import { property } from "lit/decorators.js";

export interface MenuItem {
    value: string;
    label: string;
    icon: string;
}

/**
 * A simple menu component for task actions.
 * Borrowed from https://codeberg.org/dan-danache/ha-zigbee-map/src/branch/master/custom_components/zigbee_map/panel/src/zigbee-map-panel.js
 */
class HMTaskMenu extends LitElement {
    @property() hass?: HomeAssistant;
    @property() items: MenuItem[] = [];

    constructor() {
        super();
    }

    render() {
        return html`
            <ha-dropdown @wa-select=${this._handleMenuAction}>
                <ha-icon-button slot="trigger">
                    <ha-icon icon="mdi:dots-vertical"></ha-icon>
                </ha-icon-button>
                ${this.items.map(item => html`
                    <ha-dropdown-item value="${item.value}">
                        <span>${item.label}</span>
                        <ha-icon slot="icon" icon="${item.icon}"></ha-icon>
                    </ha-dropdown-item>
                `)}
            </ha-dropdown>
        `
    }

    _handleMenuAction(event: CustomEvent) {
        const action = event.detail.item.value;
        this.dispatchEvent(new CustomEvent('menu-action', {
            detail: { action },
            bubbles: true,
            composed: true
        }));
    }

    static get styles() {
        return css`
            ha-icon-button ha-icon {
                display: flex;
            }
            span {
                white-space: nowrap;
                padding-right: 1em;
            }
        `
    }
}

if (!customElements.get('hm-task-menu')) customElements.define('hm-task-menu', HMTaskMenu)
