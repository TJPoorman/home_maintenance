"""Support for Home Maintenance binary sensors."""

import logging
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta
from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from . import const

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,  # noqa: ARG001
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Home Maintenance binary sensor platform."""
    if const.DOMAIN not in hass.data:
        hass.data[const.DOMAIN] = {}
    hass.data[const.DOMAIN]["add_entities"] = async_add_entities

    device_id = hass.data[const.DOMAIN].get("device_id")
    store = hass.data[const.DOMAIN].get("store")

    entities = []
    for task in store.get_all():
        entity = HomeMaintenanceSensor(hass, task, device_id)
        entities.append(entity)
        hass.data[const.DOMAIN]["entities"][task["id"]] = entity

    async_add_entities(entities)


class HomeMaintenanceSensor(BinarySensorEntity):
    """Representation of a Home Maintenance binary sensor."""

    def __init__(
        self,
        hass: HomeAssistant,
        task: dict,
        device_id: str,
        labels: list[str] | None = None,
    ) -> None:
        """Initialize the Home Maintenance sensor."""
        self.hass = hass
        self.task = task
        self._attr_name = task["title"]
        self._attr_unique_id = f"{task['id']}"
        self._device_id = device_id
        self._labels = labels or []
        self._update_state()

    @property
    def device_info(self) -> DeviceInfo | None:
        """Return device information for this sensor."""
        return DeviceInfo(
            identifiers={(const.DOMAIN, const.DEVICE_KEY)},
            name=const.NAME,
            model=const.NAME,
            sw_version=const.VERSION,
            manufacturer=const.MANUFACTURER,
        )

    @property
    def icon(self) -> str | None:
        """Return the icon for the task."""
        return self.task.get("icon", "mdi:calendar-check")

    def _calculate_next_due(
        self, last_performed: datetime, interval_value: int, interval_type: str
    ) -> datetime:
        """Calculate the next date based on last date and interval."""
        if interval_type == "days":
            return last_performed + timedelta(days=interval_value)
        if interval_type == "weeks":
            return last_performed + timedelta(weeks=interval_value)
        if interval_type == "months":
            return last_performed + relativedelta(months=interval_value)

        return last_performed

    def _update_state(self) -> None:
        """Get the latest state of the sensor."""
        trigger_type = self.task.get("trigger_type", "time")

        if trigger_type == "count":
            self._update_state_count()
            return

        if trigger_type == "runtime":
            self._update_state_runtime()
            return

        self._update_state_time()

    def _update_state_count(self) -> None:
        """Update state for count-based tasks."""
        current_count = self.task.get("current_count", 0)
        count_threshold = self.task.get("count_threshold", 0)
        count_entity_id = self.task.get("count_entity_id")

        self._attr_is_on = current_count >= count_threshold if count_threshold > 0 else False
        self._attr_extra_state_attributes = {
            "trigger_type": "count",
            "current_count": current_count,
            "count_threshold": count_threshold,
            "count_entity_id": count_entity_id,
            "last_performed": self.task.get("last_performed", ""),
        }
        if self.task.get("tag_id"):
            self._attr_extra_state_attributes["tag_id"] = self.task["tag_id"]

    def _update_state_runtime(self) -> None:
        """Update state for runtime-based tasks."""
        runtime_entity_id = self.task.get("runtime_entity_id")
        runtime_threshold = self.task.get("runtime_threshold", 0)
        runtime_baseline = self.task.get("runtime_baseline", 0)

        current_value = None
        delta = 0

        if runtime_entity_id:
            state = self.hass.states.get(runtime_entity_id)
            if state and state.state not in ("unknown", "unavailable"):
                try:
                    current_value = float(state.state)
                    # Detect external reset (sensor went back below baseline)
                    if current_value < runtime_baseline:
                        runtime_baseline = 0
                        self.task["runtime_baseline"] = 0
                    delta = current_value - runtime_baseline
                except (ValueError, TypeError):
                    current_value = None

        self._attr_is_on = delta >= runtime_threshold if runtime_threshold > 0 and current_value is not None else False
        self._attr_extra_state_attributes = {
            "trigger_type": "runtime",
            "runtime_entity_id": runtime_entity_id,
            "runtime_threshold": runtime_threshold,
            "runtime_baseline": runtime_baseline,
            "runtime_current": current_value,
            "runtime_delta": round(delta, 2),
            "last_performed": self.task.get("last_performed", ""),
        }
        if self.task.get("tag_id"):
            self._attr_extra_state_attributes["tag_id"] = self.task["tag_id"]

    def _update_state_time(self) -> None:
        """Update state for time-based tasks."""
        last = dt_util.parse_datetime(self.task["last_performed"])
        if last is None:
            self._attr_is_on = True
            self._attr_extra_state_attributes = {
                "trigger_type": "time",
                "last_performed": self.task["last_performed"],
                "interval_value": self.task["interval_value"],
                "interval_type": self.task["interval_type"],
                "next_due": "unknown",
            }
            if self.task.get("tag_id"):
                self._attr_extra_state_attributes["tag_id"] = self.task["tag_id"]
            return

        if last.tzinfo is None:
            last = dt_util.as_utc(last)

        interval_value = self.task["interval_value"]
        interval_type = self.task["interval_type"]
        due_date = self._calculate_next_due(
            last, interval_value, interval_type
        ).replace(hour=0, minute=0, second=0, microsecond=0)

        self._attr_is_on = (
            dt_util.now().replace(hour=0, minute=0, second=0, microsecond=0) >= due_date
        )
        self._attr_extra_state_attributes = {
            "trigger_type": "time",
            "last_performed": self.task["last_performed"],
            "interval_value": self.task["interval_value"],
            "interval_type": self.task["interval_type"],
            "next_due": due_date.isoformat(),
        }
        if self.task.get("tag_id"):
            self._attr_extra_state_attributes["tag_id"] = self.task["tag_id"]

    async def async_update(self) -> None:
        """Get the latest state of the sensor."""
        self._update_state()

    async def async_added_to_hass(self) -> None:
        """Run when entity is added to Home Assistant."""
        if self._labels:
            registry = er.async_get(self.hass)
            if registry.async_get(self.entity_id):
                registry.async_update_entity(self.entity_id, labels=set(self._labels))
