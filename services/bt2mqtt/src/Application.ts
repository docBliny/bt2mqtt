import { Colors, ITerminal } from "@rushstack/node-core-library";
import { DeviceManager } from "@docbliny/bluetooth";
import { Device } from "@docbliny/node-ble";
import { Config, IBlindConfig } from "./Config.js";
import { Blind } from "@docbliny/msblinds";
import * as BlindConstants from "@docbliny/msblinds";
// @ts-expect-error
import mqtt_client from "u8-mqtt/esm/node/index.js";

import * as BlindMqtt from "./HomeAssistant/BlindMqtt.js";

export class Application {
  // **************************************** //
  // Protected properties
  // **************************************** //
  protected config: Config;
  protected deviceManager: DeviceManager;
  protected mqttClient: mqtt_client;
  protected isMqttConnected: boolean = false;
  protected terminal: ITerminal;
  protected isDisposed: boolean = false;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(terminal: ITerminal, config: Config) {
    this.terminal = terminal;
    this.terminal.writeVerboseLine("Application.constructor()");
    this.config = config;

    this._onDeviceAvailable = this._onDeviceAvailable.bind(this);
    this._onDeviceUnavailable = this._onDeviceUnavailable.bind(this);
    this.deviceManager = new DeviceManager(this.terminal, {
      discoveryInterval: this.config.deviceDiscoveryInterval,
      discoveryTimeout: this.config.deviceDiscoveryTimeout,
      maxConnectRetries: this.config.deviceMaxConnectRetries,
    });

    this._onBlindAngleChanged = this._onBlindAngleChanged.bind(this);
    this._onBlindBatteryLevelChanged = this._onBlindBatteryLevelChanged.bind(this);
    this._onBlindBatteryTemperatureChanged = this._onBlindBatteryTemperatureChanged.bind(this);
    this._onBlindBatteryVoltageChanged = this._onBlindBatteryVoltageChanged.bind(this);
    this._onBlindDisconnected = this._onBlindDisconnected.bind(this);
    this._onBlindIlluminanceChanged = this._onBlindIlluminanceChanged.bind(this);
    this._onBlindInteriorTemperatureChanged = this._onBlindInteriorTemperatureChanged.bind(this);
    this._onBlindIsOverTemperatureChanged = this._onBlindIsOverTemperatureChanged.bind(this);
    this._onBlindIsUnderVoltageLockoutChanged = this._onBlindIsUnderVoltageLockoutChanged.bind(this);
    this._onBlindIsSolarChargingChanged = this._onBlindIsSolarChargingChanged.bind(this);
    this._onBlindIsUsbChargingChanged = this._onBlindIsUsbChargingChanged.bind(this);
    this._onBlindMqttMessageReceived = this._onBlindMqttMessageReceived.bind(this);
    this._onBlindRssiChanged = this._onBlindRssiChanged.bind(this);
    this._onBlindSolarPanelVoltageChanged = this._onBlindSolarPanelVoltageChanged.bind(this);
    this._onBlindUnlocked = this._onBlindUnlocked.bind(this);
    this._onBlindUnlockFailed = this._onBlindUnlockFailed.bind(this);
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    await this.deviceManager.initialize();
    this.deviceManager.addListener("device-available", this._onDeviceAvailable);
    this.deviceManager.addListener("device-unavailable", this._onDeviceUnavailable);
  }

  public async dispose(): Promise<void> {
    this.terminal.writeDebugLine("Application.dispose()");
    this.isDisposed = true;

    // Check if we can send an availability update via MQTT for devices
    if (this.isMqttConnected) {
      for (const blindConfig of this.config.blinds) {
        await this._publishBlindAvailability(blindConfig, false);
      }
    }

    try {
      BlindMqtt.getBlindListenTopics().forEach((topic) => {
        this.mqttClient?.unsubscribe(topic, this._onBlindMqttMessageReceived);
      });
    } catch (e) {
      this.terminal.writeErrorLine(`Error unsubscribing from blind topics: ${e}`);
    } finally {
      this.mqttClient = undefined;
      this.isMqttConnected = false;
    }

    // Stop MQTT
    try {
      this.mqttClient?.disconnect();
    } catch (e) {
      this.terminal.writeErrorLine(`Error disconnecting from MQTT broker: ${e}`);
    } finally {
      this.mqttClient = undefined;
      this.isMqttConnected = false;
    }

    // Dispose device manager (and all registered devices)
    await this.deviceManager.dispose();

    this.terminal.writeLine(Colors.green("Thanks for playing. Goodbye."));
  }

  public async start(): Promise<void> {
    this.terminal.writeDebugLine("Application.start()");

    // Initialize MQTT
    await this._connectMqtt();

    // Subscribe to all blind messages
    BlindMqtt.getBlindListenTopics().forEach((topic) => {
      this.terminal.writeVerboseLine("Subscribing to MQTT topic: ", Colors.yellow(topic));
      this.mqttClient.subscribe_topic(topic, this._onBlindMqttMessageReceived);
    });

    // Send discovery messages
    if (this.config.homeAssistantConfig.discoveryEnabled) {
      for (const blindConfig of this.config.blinds) {
        await this._publishHomeAssistantDiscovery(blindConfig);
      }
    }

    // Add any configured blinds to DeviceManager
    const blinds: Array<string> = this.config.blinds.map((blind) => {
      return blind.mac;
    });

    // Initialize Bluetooth and start scanning for requested devices
    await this.deviceManager.start({
      adapterName: this.config.adapterName,
      macAddresses: blinds,
    });
  }

  // **************************************** //
  // Private methods, event handlers
  // **************************************** //
  private async _onBlindMqttMessageReceived(pkt: any, params: any, ctx: any): Promise<void> {
    this.terminal.writeDebugLine("Received MQTT message on topic ", Colors.yellow(pkt.topic), ": ", Colors.yellow(pkt.text()));

    const blind: Blind | undefined = this.deviceManager.devices[params.mac.replace(/_/g, ":")] as Blind;

    if (blind) {
      if (pkt.topic.endsWith("tilt/set")) {
        await blind.setAngle(pkt.json());
      } else if (pkt.topic.endsWith("set")) {
        const command: string = pkt.text();
        if (command === "OPEN") {
          await blind.setAngle(Math.floor(BlindConstants.MAX_ANGLE / 2));
        } else if (command === "CLOSE") {
          await blind.setAngle(0);
        } else {
          this.terminal.writeErrorLine("Invalid angle command received: ", Colors.yellow(command));
        }
      }
    }
  }

  private async _onDeviceAvailable(device: Device): Promise<void> {
    const macAddress: string = device.address;
    this.terminal.writeDebugLine("Device available: ", Colors.yellow(macAddress));

    // Check if this device is already registered
    if (!this.deviceManager.containsDeviceByMacAddress(macAddress)) {
      if (this._isBlind(macAddress)) {
        const blindConfig: IBlindConfig | undefined = this._getBlindConfig(macAddress);
        if (!blindConfig || !blindConfig.passkey) {
          this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(macAddress));
        } else {
          this.terminal.writeLine("Adding smart blind ", Colors.yellow(`${blindConfig.name} (${macAddress})`));

          // Create new Blind instance
          const blind: Blind = new Blind(this.terminal, this.deviceManager, device, {
            maxUnlockRetries: this.config.blindsMaxUnlockRetries,
            passkey: blindConfig.passkey,
          });

          // Add application listeners
          blind.addListener("angle-changed", this._onBlindAngleChanged);
          blind.addListener("battery-level-changed", this._onBlindBatteryLevelChanged);
          blind.addListener("battery-temperature-changed", this._onBlindBatteryTemperatureChanged);
          blind.addListener("battery-voltage-changed", this._onBlindBatteryVoltageChanged);
          blind.addListener("disconnect", this._onBlindDisconnected);
          blind.addListener("illuminance-changed", this._onBlindIlluminanceChanged);
          blind.addListener("interior-temperature-changed", this._onBlindInteriorTemperatureChanged);
          blind.addListener("is-over-temperature-changed", this._onBlindIsOverTemperatureChanged);
          blind.addListener("is-solar-charging-changed", this._onBlindIsSolarChargingChanged);
          blind.addListener("is-usb-charging-changed", this._onBlindIsUsbChargingChanged);
          blind.addListener("is-under-voltage-lockout-changed", this._onBlindIsUnderVoltageLockoutChanged);
          blind.addListener("rssi-changed", this._onBlindRssiChanged);
          blind.addListener("solar-panel-voltage-changed", this._onBlindSolarPanelVoltageChanged);
          blind.addListener("unlock-failed", this._onBlindUnlockFailed);
          blind.addListener("unlocked", this._onBlindUnlocked);

          // Add to manager
          this.deviceManager.addDevice(blind);

          // Connect to device
          try {
            await blind.connect();
          } catch (e) {
            this.terminal.writeErrorLine(
              "Error connecting to device ",
              Colors.bold(`${blindConfig.name} (${macAddress})`),
              `: ${e}`,
            );
            await blind.dispose();
          }
        }
      } else {
        this.terminal.writeWarningLine(Colors.yellow("Unsupported device "), Colors.bold(macAddress), " found. Skipping...");
      }
    } else {
      this.terminal.writeWarningLine(Colors.yellow("Device "), Colors.bold(macAddress), " already registered. Skipping...");
    }

    // Check if all devices were registered and stop discovery
    if (this.deviceManager.haveFoundAllDevices(this.config.blinds.map((blind) => blind.mac))) {
      // this.terminal.writeVerboseLine(Colors.green("All devices registered. Stopping discovery..."));
      await this.deviceManager.stopDiscovery();
    }
  }

  private async _onBlindAngleChanged(blind: Blind, angle: number): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine("Blind ", Colors.yellow(blindConfig.name), " angle changed to ", Colors.blue(`${angle}`));

      // TODO: Make the angle rounding configurable
      let roundedAngle: number = angle;
      if (roundedAngle >= 190) {
        roundedAngle = 200;
      } else if (roundedAngle <= 10) {
        roundedAngle = 0;
      }

      await this._publishNumberMessage(BlindMqtt.getBlindTiltStatusTopic(blindConfig), roundedAngle);

      if (roundedAngle <= 10 || roundedAngle >= 190) {
        await this._publishStringMessage(BlindMqtt.getBlindStateTopic(blindConfig), "closed");
      } else {
        await this._publishStringMessage(BlindMqtt.getBlindStateTopic(blindConfig), "open");
      }
    }
  }

  private async _onBlindBatteryLevelChanged(blind: Blind, batteryLevel: number): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " battery level changed to ",
        Colors.blue(`${batteryLevel}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindBatteryStateTopic(blindConfig),
        {
          battery_level: batteryLevel,
          battery_temperature: blind.batteryTemperature,
          battery_voltage: blind.batteryVoltage,
        },
        false,
      );
    }
  }

  private async _onBlindBatteryTemperatureChanged(blind: Blind, batteryTemperature: number): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " battery temperature changed to ",
        Colors.blue(`${batteryTemperature}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindBatteryStateTopic(blindConfig),
        {
          battery_level: blind.batteryLevel,
          battery_temperature: batteryTemperature,
          battery_voltage: blind.batteryVoltage,
        },
        false,
      );
    }
  }

  private async _onBlindBatteryVoltageChanged(blind: Blind, batteryVoltage: number): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " battery voltage changed to ",
        Colors.blue(`${batteryVoltage}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindBatteryStateTopic(blindConfig),
        {
          battery_level: blind.batteryLevel,
          battery_temperature: blind.batteryTemperature,
          battery_voltage: batteryVoltage,
        },
        false,
      );
    }
  }

  private async _onBlindIlluminanceChanged(blind: Blind, illuminance: number): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " illuminance changed to ",
        Colors.blue(`${illuminance}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindIlluminanceStateTopic(blindConfig),
        {
          illuminance: illuminance,
        },
        false,
      );
    }
  }

  private async _onBlindInteriorTemperatureChanged(blind: Blind, interiorTemperature: number): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " interior temperature changed to ",
        Colors.blue(`${interiorTemperature}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindInteriorTemperatureStateTopic(blindConfig),
        {
          interior_temperature: interiorTemperature,
        },
        false,
      );
    }
  }

  private async _onBlindIsOverTemperatureChanged(blind: Blind, isOverTemperature: boolean): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " is over temperature changed to ",
        Colors.blue(`${isOverTemperature}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindIsOverTemperatureStateTopic(blindConfig),
        {
          is_over_temperature: isOverTemperature,
        },
        false,
      );
    }
  }

  private async _onBlindIsSolarChargingChanged(blind: Blind, isSolarCharging: boolean): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " is solar charging changed to ",
        Colors.blue(`${isSolarCharging}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindChargingStateTopic(blindConfig),
        {
          is_solar_charging: isSolarCharging,
          is_usb_charging: blind.isUsbCharging,
        },
        false,
      );
    }
  }

  private async _onBlindIsUsbChargingChanged(blind: Blind, isUsbCharging: boolean): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " is USB charging changed to ",
        Colors.blue(`${isUsbCharging}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindChargingStateTopic(blindConfig),
        {
          is_usb_charging: isUsbCharging,
        },
        false,
      );
    }
  }

  private async _onBlindIsUnderVoltageLockoutChanged(blind: Blind, isUnderVoltageLockout: boolean): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " is under voltage lockout changed to ",
        Colors.blue(`${isUnderVoltageLockout}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindIsUnderVoltageLockoutStateTopic(blindConfig),
        {
          is_under_voltage_lockout: isUnderVoltageLockout,
        },
        false,
      );
    }
  }

  private async _onBlindDisconnected(blind: Blind): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine(
        "Blind ",
        Colors.yellow(blind.address),
        " disconnected, but unable to find valid blind config",
      );
    } else {
      this.terminal.writeErrorLine("Blind ", Colors.bold(blindConfig.name), " disconnected");

      if (!this.isDisposed) {
        await this._publishBlindAvailability(blindConfig, false);
      }
    }

    try {
      await blind.dispose();
    } catch (e) {
      this.terminal.writeErrorLine("Error disposing blind: ", e);
    }
  }

  private async _onBlindRssiChanged(blind: Blind, rssi: number): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine("Blind ", Colors.yellow(blindConfig.name), " rssi changed to ", Colors.blue(`${rssi}`));

      await this._publishJsonMessage(
        BlindMqtt.getBlindRssiStateTopic(blindConfig),
        {
          rssi: rssi,
        },
        false,
      );
    }
  }

  private async _onBlindSolarPanelVoltageChanged(blind: Blind, solarPanelVoltage: number): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Unable to find valid blind config for ", Colors.yellow(blind.address));
    } else {
      this.terminal.writeDebugLine(
        "Blind ",
        Colors.yellow(blindConfig.name),
        " solar panel voltage changed to ",
        Colors.blue(`${solarPanelVoltage}`),
      );

      await this._publishJsonMessage(
        BlindMqtt.getBlindSolarPanelStateTopic(blindConfig),
        {
          solar_panel_voltage: solarPanelVoltage,
        },
        false,
      );
    }
  }

  private async _onBlindUnlocked(blind: Blind): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Blind ", Colors.yellow(blind.address), " unlocked, but unable to find valid blind config");
    } else {
      this.terminal.writeLine(Colors.green("Blind "), Colors.yellow(blindConfig.name), Colors.green(" unlocked"));
      await this._publishBlindAvailability(blindConfig, true);
    }
  }

  private async _onBlindUnlockFailed(blind: Blind): Promise<void> {
    const blindConfig: IBlindConfig | undefined = this._getBlindConfig(blind.address);

    if (!blindConfig) {
      this.terminal.writeErrorLine("Blind ", Colors.bold(blind.address), " unlock failed, but unable to find valid blind config");
    } else {
      this.terminal.writeErrorLine("Blind ", Colors.bold(blindConfig.name), " unlock failed");
    }
  }

  private async _onDeviceUnavailable(uuid: string): Promise<void> {
    this.terminal.writeDebugLine("Device unavailable: ", Colors.yellow(uuid));

    // TODO: Dispose?
  }

  // **************************************** //
  // Private methods
  // **************************************** //
  private async _publishBlindAvailability(blindConfig: IBlindConfig, available: boolean): Promise<void> {
    await this.mqttClient.publish({
      topic: BlindMqtt.getBlindAvailabilityTopic(blindConfig),
      payload: available ? "online" : "offline",
      qos: 0,
      retain: true,
    });
  }

  private async _publishHomeAssistantDiscovery(blindConfig: IBlindConfig): Promise<void> {
    const message = BlindMqtt.getBlindDeviceDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(message.topic, message.payload, true);

    const batteryLevelMessage = BlindMqtt.getBlindBatteryLevelDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(batteryLevelMessage.topic, batteryLevelMessage.payload, true);

    const batteryTemperatureMessage = BlindMqtt.getBlindBatteryTemperatureDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(batteryTemperatureMessage.topic, batteryTemperatureMessage.payload, true);

    const batteryVoltageMessage = BlindMqtt.getBlindBatteryVoltageDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(batteryVoltageMessage.topic, batteryVoltageMessage.payload, true);

    const illuminanceMessage = BlindMqtt.getBlindIlluminanceDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(illuminanceMessage.topic, illuminanceMessage.payload, true);

    const interiorTemperatureMessage = BlindMqtt.getBlindInteriorTemperatureDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(interiorTemperatureMessage.topic, interiorTemperatureMessage.payload, true);

    const isOverTemperatureMessage = BlindMqtt.getBlindIsOverTemperatureDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(isOverTemperatureMessage.topic, isOverTemperatureMessage.payload, true);

    const rssiMessage = BlindMqtt.getBlindRssiDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(rssiMessage.topic, rssiMessage.payload, true);

    const isUnderVoltageLockoutMessage = BlindMqtt.getBlindIsUnderVoltageLockoutDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(isUnderVoltageLockoutMessage.topic, isUnderVoltageLockoutMessage.payload, true);

    const isSolarChargingMessage = BlindMqtt.getBlindIsSolarChargingDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(isSolarChargingMessage.topic, isSolarChargingMessage.payload, true);

    const isUsbChargingMessage = BlindMqtt.getBlindIsUsbChargingDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(isUsbChargingMessage.topic, isUsbChargingMessage.payload, true);

    const solarPanelVoltageMessage = BlindMqtt.getBlindSolarPanelVoltageDiscoveryMessage(this.config, blindConfig);
    await this._publishJsonMessage(solarPanelVoltageMessage.topic, solarPanelVoltageMessage.payload, true);
  }

  private async _publishJsonMessage(topic: string, payload: Record<string, unknown>, retain: boolean): Promise<void> {
    if (this.isMqttConnected) {
      this.terminal.writeDebugLine("Publishing to topic ", Colors.yellow(topic), ` with retain setting: ${retain}`);
      try {
        if (retain) {
          await this.mqttClient.publish({ topic, payload: JSON.stringify(payload), qos: 0, retain: true });
        } else {
          await this.mqttClient.json_post(topic, payload);
        }
      } catch (e) {
        this.terminal.writeErrorLine(`Error publishing to topic ${topic}: ${e.stack}`);
      }
    }
  }

  private async _publishStringMessage(topic: string, payload: string | Record<string, unknown>): Promise<void> {
    if (this.isMqttConnected) {
      this.terminal.writeDebugLine("Publishing to topic ", Colors.yellow(topic));
      try {
        await this.mqttClient.post(topic, payload);
      } catch (e) {
        this.terminal.writeErrorLine(`Error publishing to topic ${topic}: ${e.stack}`);
      }
    }
  }

  private async _publishNumberMessage(topic: string, payload: number): Promise<void> {
    if (this.isMqttConnected) {
      this.terminal.writeDebugLine("Publishing to topic ", Colors.yellow(topic));
      try {
        await this.mqttClient.json_post(topic, payload);
      } catch (e) {
        this.terminal.writeErrorLine("Error publishing to topic ", Colors.yellow(topic), `: ${e.stack}`);
      }
    }
  }

  private async _connectMqtt(): Promise<void> {
    this.terminal.writeDebugLine(
      "Connecting to MQTT broker ",
      Colors.yellow(`${this.config.mqttConfig.host}:${this.config.mqttConfig.port}`),
      "...",
    );

    this.mqttClient = mqtt_client()
      .with_tcp(`tcp://${this.config.mqttConfig.host}:${this.config.mqttConfig.port}`)
      .with_autoreconnect();

    this.mqttClient.log_conn = (eventName: string) => {
      switch (eventName) {
        case "on_ready":
          this.terminal.writeLine(
            Colors.green("Connected to MQTT broker "),
            Colors.yellow(`${this.config.mqttConfig.host}:${this.config.mqttConfig.port}`),
          );
          this.isMqttConnected = true;
          break;
        case "on_disconnect":
          this.terminal.writeLine("Disconnected from MQTT broker");
          this.isMqttConnected = false;
          break;
      }
    };

    const connectOptions: {
      clientId?: string;
      username?: string;
      password?: string;
    } = {};

    if (this.config.mqttConfig.clientId) {
      connectOptions.clientId = this.config.mqttConfig.clientId;
    }
    if (this.config.mqttConfig.username) {
      connectOptions.username = this.config.mqttConfig.username;
    }
    if (this.config.mqttConfig.password) {
      connectOptions.password = this.config.mqttConfig.password;
    }

    await this.mqttClient.connect(connectOptions);
  }

  private _isBlind(macAddress: string): boolean {
    return this.config.blinds.some((blind) => {
      return blind.mac === macAddress;
    });
  }

  private _getBlindConfig(macAddress: string): IBlindConfig | undefined {
    return this.config.blinds.find((blind) => {
      return blind.mac === macAddress;
    });
  }
}
