import { IConnectionState, Device, GattCharacteristic, GattServer, GattService } from "@docbliny/node-ble";
import { DeviceBase, DeviceManager, IDeviceOptions } from "@docbliny/bluetooth";
import { Colors, ITerminal } from "@rushstack/node-core-library";

import * as Constants from "./Constants.js";

export interface IBlindOptions {
  passkey: string;
  maxUnlockRetries: number;
}

export interface IBlindSensorState {
  batteryCharge: number;
  batteryPercentage: number;
  batteryTemperature: number;
  batteryVoltage: number;
  interiorTemperature: number;
  illuminance: number;
  solarPanelVoltage: number;
}

export interface IBlindStatus {
  hasSolar: boolean;
  isBonding: boolean;
  isCalibrated: boolean;
  isSolarCharging: boolean;
  isUsbCharging: boolean;
  isOverTemperature: boolean;
  isPaired: boolean;
  isPasskeyInvalid: boolean;
  isPasskeyValid: boolean;
  isReversed: boolean;
  isTimeValid: boolean;
  isUnderVoltageLockout: boolean;
  tempOverride: boolean;
}

export class Blind extends DeviceBase {
  // **************************************** //
  // Public properties
  // **************************************** //
  public rssi: number = -1;

  public rawSensorState: string = "";
  public rawStatusState: string = "";

  public angle: number = -1;
  public batteryCharge: number = -1;
  public batteryLevel: number = -1;
  public batteryTemperature: number = -1;
  public batteryVoltage: number = -1;
  public hasSolar: boolean = false;
  public interiorTemperature: number = -1;
  public isBonding: boolean | undefined = undefined;
  public isCalibrated: boolean | undefined = undefined;
  public isBlindPaired: boolean | undefined = undefined;
  public isOverTemperature: boolean | undefined = undefined;
  public isPasskeyInvalid: boolean | undefined = undefined;
  public isPasskeyValid: boolean | undefined = undefined;
  public isReversed: boolean | undefined = undefined;
  public isTimeValid: boolean | undefined = undefined;
  public isSolarCharging: boolean | undefined = undefined;
  public isUsbCharging: boolean | undefined = undefined;
  public isUnderVoltageLockout: boolean | undefined = undefined;
  public isUnlocked: boolean = false;
  public blindName: string = "";
  public passkey: string | undefined = undefined;
  public illuminance: number = -1;
  public solarPanelVoltage: number = -1;
  public tempOverride: boolean = false;
  public versionInfo: string = "";

  // **************************************** //
  // Protected properties
  // **************************************** //
  protected declare readonly options: IBlindOptions & IDeviceOptions;

  protected ackCharacteristic: GattCharacteristic | undefined = undefined;
  protected angleCharacteristic: GattCharacteristic | undefined = undefined;
  protected nameCharacteristic: GattCharacteristic | undefined = undefined;
  protected passkeyCharacteristic: GattCharacteristic | undefined = undefined;
  protected sensorCharacteristic: GattCharacteristic | undefined = undefined;
  protected statusCharacteristic: GattCharacteristic | undefined = undefined;
  protected versionInfoCharacteristic: GattCharacteristic | undefined = undefined;

  // **************************************** //
  // Private properties
  // **************************************** //
  private readonly _blindPasskey: string;
  private readonly _maxUnlockRetries: number;
  private _unlockTimer: NodeJS.Timeout | undefined = undefined;
  private _unlockAttempts: number = 0;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(
    terminal: ITerminal,
    deviceManager: DeviceManager,
    parentDevice: Device,
    options: IBlindOptions & Partial<IDeviceOptions>,
  ) {
    super(terminal, deviceManager, parentDevice, options);

    this.terminal.setPrefix(`Blind ${this.parent.address} (${this.instanceId})`);

    // Save passkey
    if (options.passkey === undefined) {
      throw new Error("Passkey is required");
    }

    this._blindPasskey = options.passkey;
    this._maxUnlockRetries = options.maxUnlockRetries;

    this.terminal.writeDebugLine("Blind options: ", Colors.blue(`${JSON.stringify({ ...options, passkey: "[REDACTED]" })}`));
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async disconnect(): Promise<void> {
    try {
      await this._disconnect();
    } catch (e) {
      this.terminal.writeErrorLine(`Error disconnecting: ${e}`);
    }
    try {
      await super.disconnect();
    } catch (e) {
      this.terminal.writeErrorLine(`Error disconnecting super: ${e}`);
    }
  }

  public async dispose(): Promise<void> {
    this.terminal.writeDebugLine("dispose()");

    await this._stopNotifications();
    this._clearCharacteristics();

    // Super disconnects
    try {
      await super.dispose();
    } catch (e) {
      this.terminal.writeErrorLine(`Error disposing super: ${e}`);
    }

    // Remove all event handlers attached to this instance
    this.removeAllListeners();
  }

  public async identifyBlind(): Promise<void> {
    if (this.statusCharacteristic !== undefined) {
      // Write identify
      await this.deviceManager.executeCommand({
        command: async () => {
          this.terminal.writeVerboseLine("Writing identify command...");

          // Write identify command
          await this.statusCharacteristic!.writeValueWithResponse(Buffer.from([Constants.STATUS_COMMAND_IDENTIFY]));
        },
        name: "identifyBlind",
        maxRetries: 5,
      });
    }
  }

  public async readAck(): Promise<void> {
    const ack: string = Buffer.from((await this.ackCharacteristic?.readValue(0)) || []).toString("hex");
    this.terminal.writeVerboseLine("readAck: ", Colors.blue(`${ack}`));
  }

  public async readPasskey(): Promise<void> {
    const passKey: string = Buffer.from((await this.passkeyCharacteristic?.readValue(0)) || []).toString("hex");
    this.terminal.writeVerboseLine("readPasskey. length=", Colors.blue(`${passKey.length}`));
  }

  public async readStatus(): Promise<void> {
    const buffer: Buffer | undefined = await this.statusCharacteristic?.readValue(0);
    if (buffer) {
      this.terminal.writeVerboseLine("readStatus: ", Colors.blue(`${JSON.stringify(this.parseBlindStatus(buffer))}`));
    }
  }

  public async readName(): Promise<void> {
    const name: string = Buffer.from((await this.nameCharacteristic?.readValue(0)) || []).toString();
    this.terminal.writeVerboseLine("readName: ", Colors.blue(`${name}`));
  }

  public async readVersionInfo(): Promise<void> {
    const versionInfo: string = Buffer.from((await this.versionInfoCharacteristic?.readValue(0)) || []).toString("hex");
    this.terminal.writeVerboseLine("readVersionInfo: ", Colors.blue(`${versionInfo}`));
  }

  public async setAngle(value: number): Promise<void> {
    if (this.isValidAngle(value) === false) {
      throw new Error(`Invalid angle value: ${value}`);
    }

    if (this.angleCharacteristic !== undefined) {
      this.terminal.writeVerboseLine("Queueing write angle...");
      await this.deviceManager.executeCommand({
        command: async () => {
          this.terminal.writeDebugLine("Writing angle ", Colors.blue(`${value}`));

          // Write angle
          await this.angleCharacteristic!.writeValueWithResponse(Buffer.from([value]));
        },
        name: "setAngle",
        maxRetries: 5,
      });
    } else {
      this.terminal.writeWarningLine(Colors.yellow("Angle characteristic not found."));
    }
  }

  public async setPasskey(passkey: string): Promise<void> {
    this.terminal.writeVerboseLine("setPasskey()");

    if (this.passkeyCharacteristic !== undefined) {
      return new Promise<void>((resolve, reject) => {
        this.deviceManager
          .executeCommand({
            command: async () => {
              let passkey: string = this._blindPasskey;
              this.terminal.writeVerboseLine("Writing passkey...");

              if (passkey.length === 12) {
                passkey = passkey + "01";
              } else {
                // NOTE: This logic is untested as I don't have a blind with a non 12 digit passkey
                passkey = passkey.slice(2) + "01";
              }

              // Write passkey (must use writeValueWithResponse))
              await this.passkeyCharacteristic!.writeValueWithResponse(Buffer.from(passkey, "hex"));

              // Resolve the setPasskey promise when the actual write has happened
              resolve();
            },
            name: "setPasskey",
            maxRetries: 5,
          })
          .catch(reject);
      });
    } else {
      this.terminal.writeWarningLine(Colors.yellow("Passkey characteristic not found."));
    }
  }

  // **************************************** //
  // Protected methods, event handlers
  // **************************************** //
  protected async onParentConnect(state: IConnectionState): Promise<void> {
    try {
      await super.onParentConnect(state);
    } catch (e) {
      this.terminal.writeErrorLine(`onParentConnect() error: ${e}`);
    }
    this.terminal.writeDebugLine("onConnect(", Colors.blue(JSON.stringify(state)), ")");

    // Reset lock status
    this.isUnlocked = false;

    try {
      this.terminal.writeVerboseLine("Getting GattServer...");
      const gattServer: GattServer = await this.parent!.getGattServer();

      this.terminal.writeVerboseLine("Getting services...");
      const services: Array<string> = gattServer.serviceUuids;

      for (const serviceId of services) {
        this.terminal.writeVerboseLine("Found serviceId ", Colors.blue(serviceId));
        const service: GattService = gattServer.getService(serviceId);

        const characteristics: Array<string> = service.characteristics;

        for (const characteristicId of characteristics) {
          const characteristic: GattCharacteristic = service.getCharacteristic(characteristicId);
          const flags: Array<string> = characteristic.flags;

          this.terminal.writeVerboseLine(
            "Found characteristic ",
            Colors.blue(Constants.CHARACTERISTIC_NAMES[characteristicId] || "Unknown"),
            ": characteristicId: ",
            Colors.blue(characteristicId),
            ", flags: ",
            Colors.blue(`${flags}`),
            Colors.blue(flags.includes("notify") ? "isNotifying: " + (await characteristic.getIsNotifying()) : ""),
          );

          if (characteristicId === Constants.ACK_CHARACTERISTIC_UUID) {
            this.ackCharacteristic = characteristic;
            // this.ackCharacteristic.addListener("value-changed", this.onAck.bind(this));
            // await characteristic.startNotifications();
          } else if (characteristicId === Constants.ANGLE_CHARACTERISTIC_UUID) {
            this.angleCharacteristic = characteristic;
            this.angleCharacteristic.addListener("value-changed", this.onAngleChanged.bind(this));
            await characteristic.startNotifications();
          } else if (characteristicId === Constants.NAME_CHARACTERISTIC_UUID) {
            this.nameCharacteristic = characteristic;
            // this.nameCharacteristic.addListener("value-changed", this.onNameChanged.bind(this));
            // await characteristic.startNotifications();
          } else if (characteristicId === Constants.PASSKEY_CHARACTERISTIC_UUID) {
            this.passkeyCharacteristic = characteristic;
            this.passkeyCharacteristic.addListener("value-changed", this.onPasskeyChanged.bind(this));
            await characteristic.startNotifications();
          } else if (characteristicId === Constants.SENSORS_CHARACTERISTIC_UUID) {
            this.sensorCharacteristic = characteristic;
            // this.sensorCharacteristic.addListener("value-changed", this.onSensorsChanged.bind(this));
            await characteristic.startNotifications();
          } else if (characteristicId === Constants.STATUS_CHARACTERISTIC_UUID) {
            this.statusCharacteristic = characteristic;
            // this.statusCharacteristic.addListener("value-changed", this.onStatusChanged.bind(this));
            await characteristic.startNotifications();
          } else if (characteristicId === Constants.VERSION_INFO_CHARACTERISTIC_UUID) {
            this.versionInfoCharacteristic = characteristic;
            // this.versionInfoCharacteristic.addListener("value-changed", this.onVersionInfoChanged.bind(this));
            // await characteristic.startNotifications();
          }
        }
      }

      this.terminal.writeVerboseLine("Service scan complete.");

      // Attempt to unlock
      await this.unlock();
    } catch (e) {
      this.terminal.writeErrorLine(`onConnect() error: ${e}`);

      // Clean up by disconnecting
      await this.disconnect();
    }
  }

  // **************************************** //
  // Protected methods, event handlers
  // **************************************** //
  protected async onAck(buffer: Buffer): Promise<void> {
    const ackResult: string = buffer.toString("hex");
    this.terminal.writeVerboseLine("onAck(", Colors.blue(`${ackResult}`), ")");

    try {
      this.emit("ack", this, ackResult);
    } catch (e) {
      this.terminal.writeErrorLine(`Error during "ack" emit: ${e}`);
    }
  }

  protected async onAngleChanged(buffer: Buffer): Promise<void> {
    const angle: number = buffer.readUInt8(0);
    this.terminal.writeVerboseLine("onAngleChanged(", Colors.blue(`${angle}`), ")");

    if (this.isValidAngle(angle) === false) {
      this.terminal.writeWarningLine(Colors.yellow("Invalid angle value received from blind: "), Colors.blue(`${this.angle}`));
      this.angle = -1;
    } else {
      if (angle !== this.angle) {
        this.terminal.writeDebugLine("Angle changed from ", Colors.blue(`${this.angle}`), " to ", Colors.blue(`${angle}`));
        this.angle = angle;
        try {
          this.emit("angle-changed", this, angle);
        } catch (e) {
          this.terminal.writeErrorLine(`Error during "angle-changed" emit: ${e}`);
        }
      }
    }
  }

  protected async onNameChanged(buffer: Buffer): Promise<void> {
    const currentName: string = buffer.toString("utf8");
    this.terminal.writeVerboseLine("onNameChanged(", Colors.blue(`${currentName}`), ")");

    if (this.blindName !== currentName) {
      try {
        this.emit("name-changed", this, currentName);
      } catch (e) {
        this.terminal.writeErrorLine(`Error during "name-changed" emit: ${e}`);
      }
    }
  }

  protected async onPasskeyChanged(buffer: Buffer): Promise<void> {
    const passkey: string = buffer.toString("hex");
    this.terminal.writeVerboseLine("onPasskeyChanged(", Colors.dim("[redacted]"), ")");

    if (passkey !== this.passkey) {
      this.passkey = passkey;
      this.terminal.writeVerboseLine("Passkey changed");

      try {
        this.emit("passkey-changed", this, passkey);
      } catch (e) {
        this.terminal.writeErrorLine(`Error during "passkey-changed" emit: ${e}`);
      }

      // Check if we were unlocked
      if (passkey && passkey.toLowerCase() === this._blindPasskey.toLowerCase() + "00") {
        this.terminal.writeDebugLine(Colors.green("Unlocked."));
        this.isUnlocked = true;
        this._unlockAttempts = 0;
        this._clearUnlockTimer();

        try {
          this.emit("unlocked", this);
        } catch (e) {
          this.terminal.writeErrorLine(`Error during "unlocked" emit: ${e}`);
        }
      } else {
        this.terminal.writeVerboseLine(Colors.yellow("Passkey did not match."));
        this.isUnlocked = false;
      }
    }
  }

  protected async onSensorsChanged(buffer: Buffer): Promise<void> {
    const currentState: IBlindSensorState = this.parseBlindSensors(buffer);
    const rawSensorState: string = buffer.toString("hex");
    const eventsToEmit: Array<() => void> = [];
    this.terminal.writeVerboseLine(
      "onSensorsChanged(",
      Colors.blue(JSON.stringify(currentState)),
      ", ",
      Colors.blue(`${rawSensorState}`),
      ")",
    );

    if (this.rawSensorState !== rawSensorState) {
      this.rawSensorState = rawSensorState;
      eventsToEmit.push(() => this.emit("sensors-changed", this, rawSensorState));

      if (this.batteryLevel !== currentState.batteryPercentage) {
        this.batteryLevel = currentState.batteryPercentage;
        eventsToEmit.push(() => this.emit("battery-level-changed", this, this.batteryLevel));
      }

      if (this.batteryTemperature !== currentState.batteryTemperature) {
        this.batteryTemperature = currentState.batteryTemperature;
        eventsToEmit.push(() => this.emit("battery-temperature-changed", this, this.batteryTemperature));
      }

      if (this.batteryVoltage !== currentState.batteryVoltage) {
        this.batteryVoltage = currentState.batteryVoltage;
        eventsToEmit.push(() => this.emit("battery-voltage-changed", this, this.batteryVoltage));
      }

      if (this.batteryCharge !== currentState.batteryCharge) {
        this.batteryCharge = currentState.batteryCharge;
        eventsToEmit.push(() => this.emit("battery-charge-changed", this, this.batteryCharge));
      }

      if (this.interiorTemperature !== currentState.interiorTemperature) {
        this.interiorTemperature = currentState.interiorTemperature;
        eventsToEmit.push(() => this.emit("interior-temperature-changed", this, this.interiorTemperature));
      }

      if (this.illuminance !== currentState.illuminance) {
        this.illuminance = currentState.illuminance;
        eventsToEmit.push(() => this.emit("illuminance-changed", this, this.illuminance));
      }

      if (this.solarPanelVoltage !== currentState.solarPanelVoltage) {
        this.solarPanelVoltage = currentState.solarPanelVoltage;
        eventsToEmit.push(() => this.emit("solar-panel-voltage-changed", this, this.solarPanelVoltage));
      }

      // Once all values have been updated, emit the events
      eventsToEmit.forEach((event) => {
        try {
          event();
        } catch (e) {
          this.terminal.writeErrorLine(`Error during "sensors-changed" emit: ${e}`);
        }
      });
    }
  }

  protected async onStatusChanged(buffer: Buffer): Promise<void> {
    const rawStatusState: string = buffer.toString("hex");
    const currentState: IBlindStatus = this.parseBlindStatus(buffer);
    const eventsToEmit: Array<() => void> = [];
    this.terminal.writeVerboseLine(
      "onStatusChanged(",
      Colors.blue(JSON.stringify(currentState)),
      ", ",
      Colors.blue(`${rawStatusState}`),
      ")",
    );

    if (rawStatusState !== this.rawStatusState) {
      this.rawStatusState = rawStatusState;
      eventsToEmit.push(() => this.emit("status-changed", this, rawStatusState));

      if (this.hasSolar !== currentState.hasSolar) {
        this.hasSolar = currentState.hasSolar;
        eventsToEmit.push(() => this.emit("has-solar-changed", this, this.hasSolar));
      }

      if (this.isBonding !== currentState.isBonding) {
        this.isBonding = currentState.isBonding;
        eventsToEmit.push(() => this.emit("is-bonding-changed", this, this.isBonding));
      }

      if (this.isCalibrated !== currentState.isCalibrated) {
        this.isCalibrated = currentState.isCalibrated;
        eventsToEmit.push(() => this.emit("is-calibrated-changed", this, this.isCalibrated));
      }

      if (this.isSolarCharging !== currentState.isSolarCharging) {
        this.isSolarCharging = currentState.isSolarCharging;
        eventsToEmit.push(() => this.emit("is-solar-charging-changed", this, this.isSolarCharging));
      }

      if (this.isUsbCharging !== currentState.isUsbCharging) {
        this.isUsbCharging = currentState.isUsbCharging;
        eventsToEmit.push(() => this.emit("is-usb-charging-changed", this, this.isUsbCharging));
      }

      if (this.isOverTemperature !== currentState.isOverTemperature) {
        this.isOverTemperature = currentState.isOverTemperature;
        eventsToEmit.push(() => this.emit("is-over-temperature-changed", this, this.isOverTemperature));
      }

      if (this.isBlindPaired !== currentState.isPaired) {
        this.isBlindPaired = currentState.isPaired;
        eventsToEmit.push(() => this.emit("is-blind-paired-changed", this, this.isBlindPaired));
      }

      // if (this.isPasskeyInvalid !== currentState.isPasskeyInvalid) {
      //   this.isPasskeyInvalid = currentState.isPasskeyInvalid;
      //   eventsToEmit.push(() => this.emit("is-passkey-invalid-changed", this, this.isPasskeyInvalid));
      // }

      // if (this.isPasskeyValid !== currentState.isPasskeyValid) {
      //   this.isPasskeyValid = currentState.isPasskeyValid;
      //   eventsToEmit.push(() => this.emit("is-passkey-valid-changed", this, this.isPasskeyValid));
      // }

      if (this.isReversed !== currentState.isReversed) {
        this.isReversed = currentState.isReversed;
        eventsToEmit.push(() => this.emit("is-reversed-changed", this, this.isReversed));
      }

      if (this.isTimeValid !== currentState.isTimeValid) {
        this.isTimeValid = currentState.isTimeValid;
        eventsToEmit.push(() => this.emit("is-time-valid-changed", this, this.isTimeValid));
      }

      if (this.isUnderVoltageLockout !== currentState.isUnderVoltageLockout) {
        this.isUnderVoltageLockout = currentState.isUnderVoltageLockout;
        eventsToEmit.push(() => this.emit("is-under-voltage-lockout-changed", this, this.isUnderVoltageLockout));
      }

      if (this.tempOverride !== currentState.tempOverride) {
        this.tempOverride = currentState.tempOverride;
        eventsToEmit.push(() => this.emit("temperature-override-changed", this, this.tempOverride));
      }

      // Once all values have been updated, emit the events
      eventsToEmit.forEach((event) => {
        try {
          event();
        } catch (e) {
          this.terminal.writeErrorLine(`Error during "status-changed" emit: ${e}`);
        }
      });
    }
  }

  protected async onVersionInfoChanged(buffer: Buffer): Promise<void> {
    const currentVersionInfo: string = buffer.toString("hex");
    this.terminal.writeVerboseLine("onVersionInfoChanged(", Colors.blue(`${currentVersionInfo}`), ")");

    if (this.versionInfo !== currentVersionInfo) {
      try {
        this.emit("version-info-changed", this, currentVersionInfo);
      } catch (e) {
        this.terminal.writeErrorLine(`Error during "version-info-change" emit: ${e}`);
      }
    }
  }

  // **************************************** //
  // Protected methods
  // **************************************** //
  protected parseBlindSensors(sensorState: Buffer): IBlindSensorState {
    return {
      batteryPercentage: sensorState.readUInt8(0),
      batteryVoltage: sensorState.readUInt16LE(2),
      batteryCharge: sensorState.readUInt16LE(4),
      solarPanelVoltage: sensorState.readUInt16LE(6),
      interiorTemperature: sensorState.readUInt16LE(8) / 10,
      batteryTemperature: sensorState.readUInt16LE(10) / 10,
      illuminance: sensorState.readUInt16LE(12) / 10,
    };
  }

  protected parseBlindStatus(buffer: Buffer): IBlindStatus {
    const status: number = buffer.readUInt32LE();

    return {
      hasSolar: (status & Constants.HAS_SOLAR) === Constants.HAS_SOLAR,
      isBonding: (status & Constants.IS_BONDING) === Constants.IS_BONDING,
      isCalibrated: (status & Constants.IS_CALIBRATED) === Constants.IS_CALIBRATED,
      isSolarCharging: (status & Constants.IS_CHARGING_SOLAR) === Constants.IS_CHARGING_SOLAR,
      isUsbCharging: (status & Constants.IS_CHARGING_USB) === Constants.IS_CHARGING_USB,
      isOverTemperature: (status & Constants.IS_OVER_TEMP) === Constants.IS_OVER_TEMP,
      isPaired: false, //(status & Constants.IS_PAIRED) === Constants.IS_PAIRED,
      isPasskeyInvalid: false, //(status & Constants.IS_PASSKEY_INVALID) === Constants.IS_PASSKEY_INVALID,
      isPasskeyValid: (status & Constants.IS_PASSKEY_VALID) === Constants.IS_PASSKEY_VALID,
      isReversed: (status & Constants.IS_REVERSED) === Constants.IS_REVERSED,
      isTimeValid: (status & Constants.IS_TIME_VALID) === Constants.IS_TIME_VALID,
      tempOverride: (status & Constants.TEMP_OVERRIDE) === Constants.TEMP_OVERRIDE,
      isUnderVoltageLockout: (status & Constants.UNDER_VOLTAGE_LOCKOUT) === Constants.UNDER_VOLTAGE_LOCKOUT,
    };
  }

  protected async unlock(): Promise<void> {
    this.terminal.writeVerboseLine(
      "unlock(",
      Colors.blue(`unlockAttempts: ${this._unlockAttempts}, maxUnlockRetries: ${this._maxUnlockRetries}`),
      ")",
    );
    if (this._unlockAttempts < this._maxUnlockRetries) {
      this._unlockAttempts++;
      this.terminal.writeDebugLine("unlock() (", Colors.yellow(`attempt ${this._unlockAttempts})`));

      // Reset lock status
      this.isUnlocked = false;

      // This will block until the passkey is set via queued command
      await this.setPasskey(this._blindPasskey);

      // Return a new promise so we can resolve it when the lock status changes
      return new Promise<void>((resolve, reject) => {
        // Make sure we have the latest passkey status
        this.deviceManager
          .executeCommand({
            command: async () => {
              await this.readPasskey();
              resolve();
            },
            name: "getPasskey",
            maxRetries: 5,
          })
          .catch(reject);
      })
        .then(this._startUnlockTimerIfLocked.bind(this))
        .catch(this._startUnlockTimerIfLocked.bind(this));
    } else {
      this.terminal.writeErrorLine("Failed to unlock blind. Retries exceeded.");
      this._clearUnlockTimer();
      try {
        this.emit("unlock-failed", this);
      } catch (e) {
        this.terminal.writeErrorLine(`Error during "unlock-failed" emit: ${e}`);
      }
    }
  }

  protected isValidAngle(value: number): boolean {
    return value >= Constants.MIN_ANGLE && value <= Constants.MAX_ANGLE;
  }

  // **************************************** //
  // Private methods
  // **************************************** //
  private _startUnlockTimerIfLocked(): void {
    // Start a timer to retry unlock if we're still locked
    if (!this.isUnlocked && !this._unlockTimer && this._unlockAttempts < this._maxUnlockRetries) {
      this.terminal.writeVerboseLine("Starting unlock timer (", Colors.yellow(`attempt ${this._unlockAttempts})`));

      this._unlockTimer = setInterval(async () => {
        await this.unlock();
      }, 1000);
    }
  }

  private async _disconnect(): Promise<void> {
    this.terminal.writeVerboseLine("_disconnect()");

    // Reset unlock state
    this._clearUnlockTimer();
    this.isUnlocked = false;
    this._unlockAttempts = 0;

    await this._stopNotifications();
    this._clearCharacteristics();
  }

  private _clearCharacteristics(): void {
    this.ackCharacteristic = undefined;
    this.angleCharacteristic = undefined;
    this.nameCharacteristic = undefined;
    this.passkeyCharacteristic = undefined;
    this.sensorCharacteristic = undefined;
    this.statusCharacteristic = undefined;
    this.versionInfoCharacteristic = undefined;
  }

  private async _stopNotifications(): Promise<void> {
    // Disconnect from all characteristics
    try {
      await this.ackCharacteristic?.stopNotifications();
    } catch (e) {
      this.terminal.writeVerboseLine(Colors.red(`Error stopping notifications on ackCharacteristic: ${e}`));
    }

    try {
      await this.angleCharacteristic?.stopNotifications();
    } catch (e) {
      this.terminal.writeVerboseLine(Colors.red(`Error stopping notifications on angleCharacteristic: ${e}`));
    }

    try {
      await this.nameCharacteristic?.stopNotifications();
    } catch (e) {
      this.terminal.writeVerboseLine(Colors.red(`Error stopping notifications on nameCharacteristic: ${e}`));
    }

    try {
      await this.passkeyCharacteristic?.stopNotifications();
    } catch (e) {
      this.terminal.writeVerboseLine(Colors.red(`Error stopping notifications on passkeyCharacteristic: ${e}`));
    }

    try {
      await this.sensorCharacteristic?.stopNotifications();
    } catch (e) {
      this.terminal.writeVerboseLine(Colors.red(`Error stopping notifications on sensorCharacteristic: ${e}`));
    }

    try {
      await this.statusCharacteristic?.stopNotifications();
    } catch (e) {
      this.terminal.writeVerboseLine(Colors.red(`Error stopping notifications on statusCharacteristic: ${e}`));
    }

    try {
      await this.versionInfoCharacteristic?.stopNotifications();
    } catch (e) {
      this.terminal.writeVerboseLine(Colors.red(`Error stopping notifications on versionInfoCharacteristic: ${e}`));
    }
  }

  private _clearUnlockTimer(): void {
    this.terminal.writeVerboseLine("clearUnlockTimer()");

    if (this._unlockTimer) {
      clearInterval(this._unlockTimer);
      this._unlockTimer = undefined;
    }
  }
}
