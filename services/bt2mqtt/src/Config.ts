import { Colors, ITerminal } from "@rushstack/node-core-library";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

const APP_ENV_PREFIX: string = "BT2MQTT";
const DEFAULT_BLINDS_CONNECT_RETRY_INTERVAL: number = 5000;
const DEFAULT_DEVICE_MAX_CONNECT_RETRIES: number = 5;
const DEFAULT_BLINDS_MAX_UNLOCK_RETRIES: number = 5;
const DEFAULT_DEVICE_DISCOVERY_INTERVAL: number = 1 * 1000;
const DEFAULT_DEVICE_DISCOVERY_TIMEOUT: number = 60 * 1000;
const MATCH_MAC_ADDRESS: RegExp = /^[a-fA-F0-9]{2}(:[a-fA-F0-9]{2}){5}$/;

// **************************************** //
// Interfaces
// **************************************** //
export interface IBlindFileConfig {
  encoded_mac?: string;
  encoded_passkey?: string;
  name: string;
  mac?: string;
  passkey?: string;
}

export interface IBlindConfig {
  name: string;
  mac: string;
  passkey: string;
}

export interface IMqttConfig {
  clientId?: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface IHomeAssistantConfig {
  discoveryEnabled: boolean;
  discoveryPrefix: string;
}

export class Config {
  // **************************************** //
  // Public properties
  // **************************************** //
  public adapterName: string | undefined;
  public blinds: Array<IBlindConfig> = [];
  public blindsConnectRetryInterval: number = DEFAULT_BLINDS_CONNECT_RETRY_INTERVAL;
  public blindsMaxUnlockRetries: number = DEFAULT_BLINDS_MAX_UNLOCK_RETRIES;
  public deviceDiscoveryInterval: number = DEFAULT_DEVICE_DISCOVERY_INTERVAL;
  public deviceDiscoveryTimeout: number = DEFAULT_DEVICE_DISCOVERY_TIMEOUT;
  public deviceMaxConnectRetries: number = DEFAULT_DEVICE_MAX_CONNECT_RETRIES;
  public homeAssistantConfig: IHomeAssistantConfig = {
    discoveryEnabled: true,
    discoveryPrefix: "homeassistant",
  };
  public mqttConfig: IMqttConfig = {
    host: "localhost",
    port: 1883,
  };

  // **************************************** //
  // Protected properties
  // **************************************** //
  protected readonly terminal: ITerminal;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(terminal: ITerminal) {
    this.terminal = terminal;
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public initializeFromConfigFile(configPath: string): void {
    try {
      const configYaml = fs.readFileSync(path.resolve(configPath), "utf-8");

      this.parseConfigYaml(configYaml);
    } catch (e) {
      this.terminal.writeErrorLine(`Error reading configuration file "${configPath}": ${e}`);
    }
  }

  public parseConfigYaml(configYaml: string): void {
    if (!configYaml) {
      this.terminal.writeErrorLine("Empty configuration.");
    } else {
      try {
        const config = parse(configYaml);

        if (config.adapter && config.adapter.name) {
          this.terminal.writeDebugLine(`Found adapter name "${config.adapter.name}" in configuration file`);
          this.adapterName = config.adapter.name;
        }

        // TODO: Max connect retries
        if (config.bluetooth && config.bluetooth.device_discovery_interval) {
          const interval = this.getConfigValue(
            config,
            APP_ENV_PREFIX,
            ["bluetooth", "device_discovery_interval"],
            DEFAULT_DEVICE_DISCOVERY_INTERVAL / 1000,
          );
          if (interval) {
            this.deviceDiscoveryInterval = interval * 1000;
          }
        }

        if (config.bluetooth && config.bluetooth.device_discovery_timeout) {
          const timeout = this.getConfigValue(
            config,
            APP_ENV_PREFIX,
            ["bluetooth", "device_discovery_timeout"],
            DEFAULT_DEVICE_DISCOVERY_TIMEOUT / 1000,
          );
          if (timeout) {
            this.deviceDiscoveryTimeout = timeout * 1000;
          }
        }

        if (config.mqtt) {
          this.terminal.writeDebugLine(`Found MQTT configuration in configuration file`);
          this.mqttConfig = {
            clientId: this.getConfigValue<string>(config, APP_ENV_PREFIX, ["mqtt", "client_id"], ""),
            host: this.getConfigValue<string>(config, APP_ENV_PREFIX, ["mqtt", "host"], ""),
            port: Number(this.getConfigValue<number>(config, APP_ENV_PREFIX, ["mqtt", "port"], 1883)),
            username: this.getConfigValue<string>(config, APP_ENV_PREFIX, ["mqtt", "username"], ""),
            password: this.getConfigValue<string>(config, APP_ENV_PREFIX, ["mqtt", "password"], ""),
          };
        }

        if (config.homeassistant) {
          this.terminal.writeDebugLine(`Found Home Assistant configuration in configuration file`);
          this.homeAssistantConfig = {
            discoveryEnabled: this.getConfigValue<boolean>(config, APP_ENV_PREFIX, ["homeassistant", "discovery_enabled"], true),
            discoveryPrefix: this.getConfigValue<string>(
              config,
              APP_ENV_PREFIX,
              ["homeassistant", "discovery_prefix"],
              "homeassistant",
            ),
          };
        }

        if (config.smart_blinds) {
          // Check if max connect retries is set
          if (config.smart_blinds.max_connect_retries) {
            this.deviceMaxConnectRetries = Number(config.smart_blinds.max_connect_retries);
          }

          // Check if connect interval is set
          if (config.smart_blinds.connect_retry_interval) {
            this.blindsConnectRetryInterval = Number(config.smart_blinds.connect_retry_interval);
          }

          // Check if max unlock retries is set
          if (config.smart_blinds.max_unlock_retries) {
            this.blindsMaxUnlockRetries = Number(config.smart_blinds.max_unlock_retries);
          }

          if (config.smart_blinds.blinds) {
            if (!Array.isArray(config.smart_blinds.blinds)) {
              this.terminal.writeWarningLine(Colors.yellow("smart_blinds is not a valid list"));
            } else {
              config.smart_blinds.blinds.forEach((blind: IBlindFileConfig) => {
                this.terminal.writeDebugLine(`Found blind "${blind.name}" with MAC address "${blind.mac}" in configuration file`);
                // Check if we have an encrypted mac/passkey
                const mac: string = blind.mac ? blind.mac : this.decodeMacAddress(blind.encoded_mac);
                const passkey: string = blind.passkey ? blind.passkey : this.decodePasskey(blind.encoded_passkey);

                if (MATCH_MAC_ADDRESS.test(mac)) {
                  // TODO: Validate the rest of the input
                  this.blinds.push({
                    name: blind.name,
                    // MAC addresses need to be uppercase or the device won't be found
                    mac: mac.toUpperCase(),
                    passkey,
                  });
                } else {
                  this.terminal.writeWarningLine(Colors.yellow(`Skipping invalid MAC address "${blind.mac}.`));
                }
              });
            }
          }
        }
      } catch (e) {
        this.terminal.writeErrorLine(`Error parsing configuration file: ${e}`);
      }
    }
  }

  public getConfigValue<T>(config: Record<string, unknown>, prefix: string, path: Array<string>, defaultValue: T): T {
    let currentObject: Record<string, unknown> = config;
    let envVarName = "";
    let result: T | undefined;

    // Generate the environment variable name and get the value from the config object, if available
    path.forEach((pathPart: string, index: number) => {
      if (envVarName !== "") {
        envVarName += "_";
      }

      envVarName += pathPart.toUpperCase();

      if (index < path.length - 1) {
        if (currentObject[pathPart] !== undefined) {
          currentObject = currentObject[pathPart] as Record<string, unknown>;
        }
      } else {
        result = currentObject[pathPart] as T;
      }
    });

    // Check if the environment variable is set
    if (process.env[`${prefix}_${envVarName}`] !== undefined) {
      result = process.env[`${prefix}_${envVarName}`] as T;
    }

    return result ?? defaultValue;
  }

  public toHex(value: number): string {
    return value.toString(16).padStart(2, "0").toUpperCase();
  }

  public decodeMacAddress(encodedMacAddress: string | undefined): string {
    if (!encodedMacAddress) {
      return "";
    }

    const result: Array<string> = [];
    const macAddress = Buffer.from(encodedMacAddress, "base64");
    macAddress.forEach((d) => result.push(this.toHex(d)));

    return result.reverse().join(":");
  }

  public decodePasskey(encodedPasskey: string | undefined): string {
    if (!encodedPasskey) {
      return "";
    }

    const result: Array<string> = [];
    const key = Buffer.from(encodedPasskey, "base64");
    key.forEach((d) => result.push(this.toHex(d)));

    return result.join("");
  }
}
