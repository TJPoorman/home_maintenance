"""Support for Home Maintenance platform."""

import logging
from datetime import datetime
from typing import cast

from homeassistant.components.binary_sensor import DOMAIN as PLATFORM
from homeassistant.components.tag.const import EVENT_TAG_SCANNED
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Event, HomeAssistant, ServiceCall, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_registry import RegistryEntry  # noqa: TC002
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

from . import const
from .panel import (
    async_register_panel,
    async_unregister_panel,
)
from .store import TaskStore
from .websocket import async_register_websockets

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = const.CONFIG_SCHEMA


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:  # noqa: ARG001
    """Track states and offer events for sensors."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up the Home Maintenance config entry."""

    @callback
    def handle_tag_scanned_event(event: Event) -> None:
        """Handle when a tag is scanned."""
        tag_id = event.data.get("tag_id")  # Actually tag UUID

        store = hass.data[const.DOMAIN].get("store")
        tasks = store.get_by_tag_uuid(tag_id)
        if not tasks:
            return

        _LOGGER.debug("Tag scanned: %s", tag_id)

        for task in tasks:
            task_id = task["id"]
            store.update_last_performed(task_id)

    # Initialize and load stored tasks
    task_store = TaskStore(hass)
    await task_store.async_load()

    # Register Device
    device_registry = dr.async_get(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(const.DOMAIN, const.DEVICE_KEY)},
        name=const.NAME,
        model=const.NAME,
        sw_version=const.VERSION,
        manufacturer=const.MANUFACTURER,
    )

    hass.data.setdefault(const.DOMAIN, {})
    hass.data[const.DOMAIN] = {
        "add_entities": None,
        "entry_id": entry.entry_id,
        "device_id": device.id,
        "store": task_store,
        "entities": {},
    }

    await hass.config_entries.async_forward_entry_setups(entry, [PLATFORM])

    # Register the panel (frontend)
    await async_register_panel(hass, entry)

    # Websocket support
    await async_register_websockets(hass)

    # Register custom services
    register_services(hass)

    # Register event listener for tag scanned
    unsub = hass.bus.async_listen(EVENT_TAG_SCANNED, handle_tag_scanned_event)
    hass.data[const.DOMAIN]["unsub_tag_scanned"] = unsub

    # Set up state change listeners for count-based tasks
    setup_count_listeners(hass, task_store)

    # Set up state change listeners for runtime-based tasks
    setup_runtime_listeners(hass, task_store)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Home Maintenance config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, [PLATFORM])
    if not unload_ok:
        return False

    if "unsub_tag_scanned" in hass.data[const.DOMAIN]:
        hass.data[const.DOMAIN]["unsub_tag_scanned"]()

    # Unsubscribe count listeners
    for unsub in hass.data[const.DOMAIN].get("unsub_count_listeners", []):
        unsub()

    # Unsubscribe runtime listeners
    for unsub in hass.data[const.DOMAIN].get("unsub_runtime_listeners", []):
        unsub()

    async_unregister_panel(hass)
    hass.data.pop(const.DOMAIN, None)
    return True


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle reload of a config entry."""
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:  # noqa: ARG001
    """Remove Home Maintenance config entry."""
    async_unregister_panel(hass)
    del hass.data[const.DOMAIN]


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:  # noqa: ARG001
    """Handle migration of config entry."""
    return True


@callback
def register_services(hass: HomeAssistant) -> None:
    """Register services used by home maintenance component."""

    async def async_srv_reset(call: ServiceCall) -> None:
        entity_id = call.data["entity_id"]
        performed_date_str = call.data.get("performed_date")

        performed_date = None
        if performed_date_str is not None:
            parsed_date = dt_util.parse_date(performed_date_str)
            if parsed_date is None:
                msg = f"Could not parse performed_date: {performed_date_str}"
                raise ValueError(msg)
            combined_date = datetime.combine(parsed_date, datetime.min.time())
            performed_date = dt_util.as_local(combined_date)

        entity_registry = er.async_get(hass)
        entry = cast("RegistryEntry", entity_registry.async_get(entity_id))
        task_id = entry.unique_id
        entity = hass.data[const.DOMAIN]["entities"].get(task_id)
        if entity is None:
            return

        store = hass.data[const.DOMAIN].get("store")
        store.update_last_performed(task_id, performed_date)

    hass.services.async_register(
        const.DOMAIN,
        const.SERVICE_RESET,
        async_srv_reset,
        schema=const.SERVICE_RESET_SCHEMA,
    )

    async def async_srv_increment_count(call: ServiceCall) -> None:
        entity_id = call.data["entity_id"]
        entity_registry = er.async_get(hass)
        entry = cast("RegistryEntry", entity_registry.async_get(entity_id))
        task_id = entry.unique_id
        store = hass.data[const.DOMAIN].get("store")
        store.increment_count(task_id)

    hass.services.async_register(
        const.DOMAIN,
        const.SERVICE_INCREMENT_COUNT,
        async_srv_increment_count,
        schema=const.SERVICE_INCREMENT_COUNT_SCHEMA,
    )

    async def async_srv_reset_count(call: ServiceCall) -> None:
        entity_id = call.data["entity_id"]
        entity_registry = er.async_get(hass)
        entry = cast("RegistryEntry", entity_registry.async_get(entity_id))
        task_id = entry.unique_id
        store = hass.data[const.DOMAIN].get("store")
        store.reset_count(task_id)

    hass.services.async_register(
        const.DOMAIN,
        const.SERVICE_RESET_COUNT,
        async_srv_reset_count,
        schema=const.SERVICE_RESET_COUNT_SCHEMA,
    )


@callback
def setup_count_listeners(hass: HomeAssistant, task_store: TaskStore) -> None:
    """Set up state change listeners for count-based tasks.

    Uses a single listener that dynamically reads the current task list,
    so it handles tasks added/updated after setup.
    """
    # Remove old listeners if any
    for unsub in hass.data[const.DOMAIN].get("unsub_count_listeners", []):
        unsub()

    @callback
    def handle_state_change(event: Event) -> None:
        """Handle state change for counted entities."""
        entity_id = event.data.get("entity_id")
        old_state = event.data.get("old_state")
        new_state = event.data.get("new_state")

        if old_state is None or new_state is None:
            return

        # Only count transitions to "on" state
        if new_state.state != "on" or old_state.state == "on":
            return

        store = hass.data[const.DOMAIN].get("store")
        if not store:
            return

        for task_data in store.get_all():
            if (
                task_data.get("trigger_type") == "count"
                and task_data.get("count_entity_id") == entity_id
            ):
                _LOGGER.debug(
                    "Count increment for task %s (entity %s turned on)",
                    task_data["id"],
                    entity_id,
                )
                store.increment_count(task_data["id"])

    unsub = hass.bus.async_listen(EVENT_STATE_CHANGED, handle_state_change)
    hass.data[const.DOMAIN]["unsub_count_listeners"] = [unsub]


@callback
def setup_runtime_listeners(hass: HomeAssistant, task_store: TaskStore) -> None:
    """Set up state change listeners for runtime-based tasks."""
    for unsub in hass.data[const.DOMAIN].get("unsub_runtime_listeners", []):
        unsub()

    @callback
    def handle_runtime_state_change(event: Event) -> None:
        """Handle state change for runtime entities."""
        entity_id = event.data.get("entity_id")
        new_state = event.data.get("new_state")

        if new_state is None:
            return

        store = hass.data[const.DOMAIN].get("store")
        if not store:
            return

        for task_data in store.get_all():
            if (
                task_data.get("trigger_type") == "runtime"
                and task_data.get("runtime_entity_id") == entity_id
            ):
                try:
                    current_value = float(new_state.state)
                except (ValueError, TypeError):
                    continue

                runtime_baseline = task_data.get("runtime_baseline", 0)

                # Detect external reset
                if current_value < runtime_baseline:
                    _LOGGER.debug(
                        "Runtime reset detected for task %s (value %s < baseline %s)",
                        task_data["id"],
                        current_value,
                        runtime_baseline,
                    )
                    store.update_runtime_baseline(task_data["id"], 0)
                else:
                    # Just refresh the entity state
                    entity = hass.data[const.DOMAIN]["entities"].get(task_data["id"])
                    if entity:
                        hass.async_create_task(
                            entity.async_update_ha_state(force_refresh=True)
                        )

    unsub = hass.bus.async_listen(EVENT_STATE_CHANGED, handle_runtime_state_change)
    hass.data[const.DOMAIN]["unsub_runtime_listeners"] = [unsub]
