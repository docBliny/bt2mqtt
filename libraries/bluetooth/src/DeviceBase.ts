import { EventEmitter } from "node:events";
import { IConnectionState, Device, GattServer } from "@docbliny/node-ble";
import { Colors, ITerminal } from "@rushstack/node-core-library";
import { Variant } from "@docbliny/dbus-next";
import { DeviceManager } from "./DeviceManager.js";
import { PrefixedTerminal } from "./PrefixedTerminal.js";

export const BT_TYPE_MAPPINGS: Record<string, string> = {
  string: "s",
  int16: "n",
  boolean: "b",
  uint16: "q",
  dict: "e",
};

export const DEFAULT_MAX_CONNECT_RETRIES: number = 5;
export const DEFAULT_CONNECT_RETRY_INTERVAL: number = 5000;

export interface IDeviceOptions {}

export abstract class DeviceBase extends EventEmitter {
  // **************************************** //
  // Public properties
  // **************************************** //
  public get characteristics(): Array<string> {
    return [...this._characteristics];
  }

  public get name(): string {
    return this.parent.name;
  }

  public get address(): string {
    return this.parent.address;
  }

  public get addressType(): string {
    return this.parent.addressType;
  }

  public get alias(): string {
    return this.parent.alias;
  }

  // **************************************** //
  // Protected properties
  // **************************************** //
  protected readonly deviceManager: DeviceManager;
  protected readonly instanceId: string = Math.random().toString(36).substring(7);
  protected readonly options: IDeviceOptions;
  protected readonly parent: Device;
  protected terminal: PrefixedTerminal;

  // **************************************** //
  // Private properties
  // **************************************** //
  private _characteristics: Array<string> = [];
  private _isConnecting: boolean = false;
  private _terminalPrefix: string = `NEW DEVICE (${this.instanceId})`;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(terminal: ITerminal, deviceManager: DeviceManager, parentDevice: Device, options: Partial<IDeviceOptions>) {
    super();

    this.terminal = new PrefixedTerminal(terminal, this._terminalPrefix);
    this.options = options;
    this.deviceManager = deviceManager;
    this.parent = parentDevice;
    this.parent.addListener("connect", this.onParentConnect.bind(this));
    this.parent.addListener("disconnect", this.onParentDisconnect.bind(this));
    this.parent.addListener("dispose", this.onParentDispose.bind(this));
    this.parent.addListener("rssi-changed", this.onParentRssiChanged.bind(this));
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async dispose(): Promise<void> {
    this.terminal.writeDebugLine("DeviceBase.dispose()");

    try {
      this.emit("dispose", this);
    } catch (e) {
      this.terminal.writeErrorLine(`Error during "dispose" emit: ${e}`);
    }

    // Remove all event handlers attached to this instance. Also ensures we don't loop in dispose from parent
    this.removeAllListeners();

    try {
      // This will also disconnect
      await this.parent.dispose();
    } catch (e) {
      this.terminal.writeErrorLine(`Error disposing device parent: ${e}`);
    }
  }

  public static buildTypedValue(type: string, value: string | number | boolean | Record<string, unknown>): Variant {
    const dbusType: string = BT_TYPE_MAPPINGS[type];
    if (!dbusType) {
      throw new Error("Unrecognized type");
    }

    return new Variant(dbusType, value);
  }

  public async getRssi(): Promise<number> {
    return this.parent.getRssi();
  }

  public async isPaired(): Promise<boolean> {
    return this.parent.isPaired();
  }

  public async isConnected(): Promise<boolean> {
    return this.parent.isConnected();
  }

  public async pair(): Promise<void> {
    return this.parent.pair();
  }

  public async cancelPair(): Promise<void> {
    return this.parent.cancelPair();
  }

  public async trust(trusted: boolean): Promise<void> {
    return this.parent.trust(trusted);
  }

  public async connect(): Promise<void> {
    if (!this._isConnecting) {
      this.terminal.writeDebugLine("Connecting to device ", Colors.yellow(this.address));
      this._isConnecting = true;
      try {
        await this.parent.connect();
      } finally {
        this._isConnecting = false;
      }
    }
  }

  public async disconnect(): Promise<void> {
    this.terminal.writeVerboseLine("disconnect()");

    try {
      await this.parent.disconnect();
    } catch (e) {
      this.terminal.writeErrorLine(`Error disconnecting parent: ${e}`);
    }
  }

  public async getGattServer(): Promise<GattServer> {
    return this.parent.getGattServer();
  }

  public toString(): string {
    return this.parent.toString();
  }

  // **************************************** //
  // Protected methods
  // **************************************** //
  protected async onParentConnect(state: IConnectionState): Promise<void> {
    this.terminal.writeVerboseLine("onParentConnect()");

    this._terminalPrefix = this.address;
    try {
      this.emit("connect", this, state);
    } catch (e) {
      this.terminal.writeErrorLine(`Error during "connect" emit: ${e}`);
    }
  }

  protected async onParentDisconnect(state: IConnectionState): Promise<void> {
    this.terminal.writeVerboseLine("onParentDisconnect()");
    try {
      this.emit("disconnect", this, state);
    } catch (e) {
      this.terminal.writeErrorLine(`Error during "disconnect" emit: ${e}`);
    }
  }

  protected async onParentDispose(): Promise<void> {
    this.terminal.writeVerboseLine("onParentDispose()");

    // Dispose this instance if parent is disposed before us
    await this.dispose();
  }

  protected async onParentRssiChanged(rssi: { rssi: number }): Promise<void> {
    this.terminal.writeVerboseLine("onParentRssiChanged()");

    try {
      this.emit("rssi-changed", this, rssi.rssi);
    } catch (e) {
      this.terminal.writeErrorLine(`Error during "rssi-changed" emit: ${e}`);
    }
  }
}
