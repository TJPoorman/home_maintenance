# 🏠 Home Maintenance Tracker for Home Assistant

Keep your home in top shape by tracking recurring maintenance tasks right inside Home Assistant!

This custom integration helps you remember important chores like changing air filters, cleaning gutters, or testing smoke alarms — and shows you when they're due.

---

## ✨ What It Does

- 📋 Lets you create recurring tasks (e.g., “Change HVAC filter every 90 days”)
- 🔔 Creates entities in Home Assistant to be able to create automations and display on dashboards
- ✅ Lets you mark tasks as completed so it can track the next due date
- 📊 Shows tasks in a clean, easy-to-use interface built into Home Assistant

---

## ⚠️ Important Note
This integration was created to fill a simple but important gap in Home Assistant: the ability to create recurring tasks without relying on multiple helpers and automations. It is intentionally minimal by design — focused solely on task tracking.

Home Assistant already provides powerful features for dashboards, automations, and alerts, and this integration is meant to complement those, not replace them.

Because it's a custom component with limited scope and resources, not all feature requests will be added or considered — especially if the functionality already exists natively in Home Assistant or falls outside the intended purpose of the integration.

Thank you for understanding and helping keep this integration focused and maintainable.

---

## 🖼️ Screenshots

- ![Task Panel](screenshots/task-panel.PNG)
- ![Integration Page](screenshots/integration-page.PNG)
- ![Entity Attributes](screenshots/entity-attributes.PNG)

---

## 🛠️ Installation

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TJPoorman&repository=home_maintenance&category=Integration)

<details>
<summary>Click to show installation instructions</summary>
<ol>
<li>Install files:</li>
<ul>
<li><u>Using HACS:</u><br>
In the HACS panel, search for 'Home Maintenance', open the repository and click 'Download'.</li>
<li><u>Manually:</u><br>
Download the <a href="https://github.com/TJPoorman/home_maintenance/releases">latest release</a> as a zip file and extract it into the `custom_components` folder in your HA installation.</li>
</ul>
<li>Restart HA to load the integration into HA.</li>
<li>Go to Settings -> Devices & services and click 'ADD INTEGRATION' button. Look for Home Maintenance and click to add it.</li>
<li>The Home Maintenance integration is ready for use. You can find the configuration panel in the menu on the left.</li>
</ol>
</details>

---

## 🛠️ How to Use

- Open **Home Maintenance** from the Home Assistant sidebar.
- To add a new task, enter:
  - Task Title: A title, e.g. “Clean Dryer Vent”
  - Interval (integer): How often it needs to be done 
  - Interval Type (selector): Select the interval period; days (default), weeks, months
  - Last Performed (optional): The last time you did it (default: today)
  - Icon (optional): Select an icon
  - Label (optional): add label
  - Tag (optional): select an NFC tag; will mark the task complete when scanned
  - Click **Add Task**
- Tasks will show if they are due or overdue
- Click **Complete** to reset the Last Performed date to today

---

## 🔄 Example Tasks

| Task                 | Interval | Last Done     |
|----------------------|----------|---------------|
| Change HVAC Filter   | 90 days  | Jan 15, 2025  |
| Test Smoke Alarms    | 6 months | Dec 1, 2024   |
| Clean Gutters        | 8 weeks  | Oct 1, 2024   |

---

## 🔁 Available Services

### `home_maintenance.reset_last_performed`

Marks a specific task as completed and updates its `last_performed` and `next_due`.

Optionally specify a date for `last_performed`.

#### Example service call:

```yaml
service: home_maintenance.reset_last_performed
data:
  entity_id: binary_sensor.clean_gutters
  performed_date: "2025-06-19"
```

---

## 💬 Need Help?

Open an issue here on GitHub or ask in the Home Assistant community.

[Home Assistant Community Thread](https://community.home-assistant.io/t/new-integration-home-maintenance-track-recurring-tasks-in-home-assistant/897324)

---

## 📄 License

MIT License – free to use, share, and improve.
