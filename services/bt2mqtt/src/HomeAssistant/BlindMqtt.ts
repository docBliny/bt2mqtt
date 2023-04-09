import { Config, IBlindConfig } from "../Config.js";
import * as BlindConstants from "@docbliny/msblinds";

export const MQTT_TOPIC_PREFIX: string = "bt2mqtt";

export function sanitizeMacAddress(macAddress: string): string {
  return macAddress.replace(/:/g, "_");
}

export function getBlindAvailabilityTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/availability`;
}

export function getBlindBatteryStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/battery/state`;
}

export function getBlindChargingStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/charging/state`;
}

export function getBlindCommandTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/set`;
}

export function getBlindIlluminanceStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/illuminance/state`;
}

export function getBlindInteriorTemperatureStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/interior_temperature/state`;
}

export function getBlindIsOverTemperatureStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/is_over_temperature/state`;
}

export function getBlindIsUnderVoltageLockoutStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/is_under_voltage_lockout/state`;
}

export function getBlindRssiStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/rssi/state`;
}

export function getBlindTiltCommandTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/tilt/set`;
}

export function getBlindTiltStatusTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/tilt/state`;
}

export function getBlindSolarPanelStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/solar_panel/state`;
}

export function getBlindStateTopic(blindConfig: IBlindConfig): string {
  return `${MQTT_TOPIC_PREFIX}/cover/${sanitizeMacAddress(blindConfig.mac)}/state`;
}

export function getBlindListenTopics(): Array<string> {
  return [`${MQTT_TOPIC_PREFIX}/cover/:mac/set`, `${MQTT_TOPIC_PREFIX}/cover/:mac/tilt/set`];
}

export function getBlindDeviceDefinition(blindConfig: IBlindConfig): Record<string, unknown> {
  return {
    connections: [["mac", blindConfig.mac]],
    identifiers: [blindConfig.mac],
    manufacturer: "MySmartBlinds, Inc.",
    model: "MySmartBlinds",
    name: blindConfig.name,
  };
}

export function getBlindDeviceDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/cover/${sanitizeMacAddress(blindConfig.mac)}/cover/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      command_topic: getBlindCommandTopic(blindConfig),
      device_class: "blind",
      device: getBlindDeviceDefinition(blindConfig),
      icon: "mdi:blinds-horizontal",
      name: blindConfig.name,
      payload_stop: null,
      state_topic: getBlindStateTopic(blindConfig),
      tilt_closed_value: 0,
      // tilt_command_template: "{{ value_json.tilt_position }}",
      tilt_command_topic: getBlindTiltCommandTopic(blindConfig),
      tilt_max: BlindConstants.MAX_ANGLE,
      tilt_min: BlindConstants.MIN_ANGLE,
      tilt_opened_value: Math.floor(BlindConstants.MAX_ANGLE / 2),
      tilt_status_topic: getBlindTiltStatusTopic(blindConfig),
      unique_id: blindConfig.mac,
    },
  };
}

export function getBlindBatteryLevelDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/sensor/${sanitizeMacAddress(blindConfig.mac)}/battery_level/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "battery",
      device: getBlindDeviceDefinition(blindConfig),
      entity_category: "diagnostic",
      name: `${blindConfig.name} Battery Level`,
      state_class: "measurement",
      state_topic: getBlindBatteryStateTopic(blindConfig),
      unit_of_measurement: "%",
      unique_id: `${blindConfig.mac}_battery_level`,
      value_template: "{{ value_json.battery_level }}",
    },
  };
}

export function getBlindBatteryTemperatureDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/sensor/${sanitizeMacAddress(
      blindConfig.mac,
    )}/battery_temperature/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "battery",
      device: getBlindDeviceDefinition(blindConfig),
      entity_category: "diagnostic",
      name: `${blindConfig.name} Battery Temperature`,
      state_class: "measurement",
      state_topic: getBlindBatteryStateTopic(blindConfig),
      unit_of_measurement: "°C",
      unique_id: `${blindConfig.mac}_battery_temperature`,
      value_template: "{{ value_json.battery_temperature }}",
    },
  };
}

export function getBlindBatteryVoltageDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/sensor/${sanitizeMacAddress(blindConfig.mac)}/battery_voltage/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "voltage",
      device: getBlindDeviceDefinition(blindConfig),
      entity_category: "diagnostic",
      name: `${blindConfig.name} Battery Voltage`,
      state_class: "measurement",
      state_topic: getBlindBatteryStateTopic(blindConfig),
      unit_of_measurement: "mV",
      unique_id: `${blindConfig.mac}_battery_voltage`,
      value_template: "{{ value_json.battery_voltage }}",
    },
  };
}

export function getBlindIlluminanceDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/sensor/${sanitizeMacAddress(blindConfig.mac)}/illuminance/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "illuminance",
      device: getBlindDeviceDefinition(blindConfig),
      name: `${blindConfig.name} Illuminance`,
      state_class: "measurement",
      state_topic: getBlindIlluminanceStateTopic(blindConfig),
      unit_of_measurement: "lx",
      unique_id: `${blindConfig.mac}_illuminance`,
      value_template: "{{ value_json.illuminance }}",
    },
  };
}

export function getBlindInteriorTemperatureDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/sensor/${sanitizeMacAddress(
      blindConfig.mac,
    )}/interior_temperature/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "temperature",
      device: getBlindDeviceDefinition(blindConfig),
      name: `${blindConfig.name} Interior Temperature`,
      state_class: "measurement",
      state_topic: getBlindInteriorTemperatureStateTopic(blindConfig),
      unit_of_measurement: "°C",
      unique_id: `${blindConfig.mac}_interior_temperature`,
      value_template: "{{ value_json.interior_temperature }}",
    },
  };
}

export function getBlindIsOverTemperatureDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/binary_sensor/${sanitizeMacAddress(
      blindConfig.mac,
    )}/over_temperature/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "problem",
      device: getBlindDeviceDefinition(blindConfig),
      entity_category: "diagnostic",
      name: `${blindConfig.name} Over Temperature`,
      payload_off: false,
      payload_on: true,
      state_topic: getBlindIsOverTemperatureStateTopic(blindConfig),
      unique_id: `${blindConfig.mac}_is_over_temperature`,
      value_template: "{{ value_json.is_over_temperature }}",
    },
  };
}

export function getBlindIsSolarChargingDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/binary_sensor/${sanitizeMacAddress(
      blindConfig.mac,
    )}/is_solar_charging/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "battery_charging",
      device: getBlindDeviceDefinition(blindConfig),
      entity_category: "diagnostic",
      name: `${blindConfig.name} Solar Charging`,
      payload_off: false,
      payload_on: true,
      state_topic: getBlindChargingStateTopic(blindConfig),
      unique_id: `${blindConfig.mac}_is_solar_charging`,
      value_template: "{{ value_json.is_solar_charging }}",
    },
  };
}

export function getBlindIsUsbChargingDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/binary_sensor/${sanitizeMacAddress(
      blindConfig.mac,
    )}/is_usb_charging/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "battery_charging",
      device: getBlindDeviceDefinition(blindConfig),
      entity_category: "diagnostic",
      name: `${blindConfig.name} USB Charging`,
      payload_off: false,
      payload_on: true,
      state_topic: getBlindChargingStateTopic(blindConfig),
      unique_id: `${blindConfig.mac}_is_usb_charging`,
      value_template: "{{ value_json.is_usb_charging }}",
    },
  };
}

export function getBlindIsUnderVoltageLockoutDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/binary_sensor/${sanitizeMacAddress(
      blindConfig.mac,
    )}/is_under_voltage_lockout/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "problem",
      device: getBlindDeviceDefinition(blindConfig),
      entity_category: "diagnostic",
      name: `${blindConfig.name} Under Voltage Lockout`,
      payload_off: false,
      payload_on: true,
      state_topic: getBlindIsUnderVoltageLockoutStateTopic(blindConfig),
      unique_id: `${blindConfig.mac}_is_under_voltage_lockout`,
      value_template: "{{ value_json.is_under_voltage_lockout }}",
    },
  };
}

export function getBlindRssiDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/sensor/${sanitizeMacAddress(blindConfig.mac)}/rssi/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "signal_strength",
      device: getBlindDeviceDefinition(blindConfig),
      name: `${blindConfig.name} Signal Strength`,
      state_class: "measurement",
      state_topic: getBlindRssiStateTopic(blindConfig),
      unit_of_measurement: "dBm",
      unique_id: `${blindConfig.mac}_rssi`,
      value_template: "{{ value_json.rssi }}",
    },
  };
}

export function getBlindSolarPanelVoltageDiscoveryMessage(
  config: Config,
  blindConfig: IBlindConfig,
): { topic: string; payload: Record<string, unknown> } {
  return {
    topic: `${config.homeAssistantConfig.discoveryPrefix}/sensor/${sanitizeMacAddress(
      blindConfig.mac,
    )}/solar_panel_voltage/config`,
    payload: {
      availability: [
        {
          topic: getBlindAvailabilityTopic(blindConfig),
        },
      ],
      device_class: "voltage",
      device: getBlindDeviceDefinition(blindConfig),
      entity_category: "diagnostic",
      name: `${blindConfig.name} Solar Panel Voltage`,
      state_class: "measurement",
      state_topic: getBlindSolarPanelStateTopic(blindConfig),
      unit_of_measurement: "mV",
      unique_id: `${blindConfig.mac}_solar_panel_voltage`,
      value_template: "{{ value_json.solar_panel_voltage }}",
    },
  };
}
