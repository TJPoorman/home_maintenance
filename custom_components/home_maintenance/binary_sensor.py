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

    @staticmethod
    def _calculate_next_due(
        last_performed: datetime, interval_value: int, interval_type: str
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
        last = dt_util.parse_datetime(self.task["last_performed"])
        if last is None:
            self._attr_is_on = True
            self._attr_extra_state_attributes = {
                "last_performed": self.task["last_performed"],
                "interval_value": self.task["interval_value"],
                "interval_type": self.task["interval_type"],
                "next_due": "unknown",
            }
            # Include due_time in attributes if available
            if "due_time" in self.task and self.task["due_time"]:
                self._attr_extra_state_attributes["due_time"] = self.task["due_time"]
            if self.task["tag_id"]:
                self._attr_extra_state_attributes["tag_id"] = self.task["tag_id"]
            return

        if last.tzinfo is None:
            last = dt_util.as_utc(last)

        interval_value = self.task["interval_value"]
        interval_type = self.task["interval_type"]
        due_date = self._calculate_next_due(
            last, interval_value, interval_type
        )

        # Apply due_time if available
        if "due_time" in self.task and self.task["due_time"]:
            try:
                hours, minutes = map(int, self.task["due_time"].split(":"))
                due_date = due_date.replace(hour=hours, minute=minutes, second=0, microsecond=0)
            except (ValueError, AttributeError):
                # If due_time is invalid, default to midnight
                due_date = due_date.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            # Default to midnight if no due_time
            due_date = due_date.replace(hour=0, minute=0, second=0, microsecond=0)

        self._attr_is_on = dt_util.now() >= due_date
        self._attr_extra_state_attributes = {
            "last_performed": self.task["last_performed"],
            "interval_value": self.task["interval_value"],
            "interval_type": self.task["interval_type"],
            "next_due": due_date.isoformat(),
        }

        # Include due_time in attributes if available
        if "due_time" in self.task and self.task["due_time"]:
            self._attr_extra_state_attributes["due_time"] = self.task["due_time"]
        if self.task["tag_id"]:
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
