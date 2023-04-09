import { EventEmitter } from "node:events";
import { buildTypedValue } from "./buildTypedValue.js";
import { BusHelper } from "./BusHelper.js";
import { GattServer } from "./GattServer.js";
import type { MessageBus, Variant } from "@docbliny/dbus-next";

export interface IConnectionState {
  connected: boolean;
}

/**
 * Device class interacts with a remote device.
 *
 * @see You can construct a Device object via {@link Adapter#getDevice} method
 */
export class Device extends EventEmitter {
  // **************************************** //
  // Public properties
  // **************************************** //
  public get address(): string {
    // Note: We don't assert that the device is initialized here because we want to be able to get the address even if the device is not initialized
    return this._address;
  }

  public get addressType(): string {
    // Note: We don't assert that the device is initialized here because we want to be able to get the addressType even if the device is not initialized
    return this._addressType;
  }

  public get alias(): string {
    // Note: We don't assert that the device is initialized here because we want to be able to get the alias even if the device is not initialized
    return this._alias;
  }

  public get name(): string {
    // Note: We don't assert that the device is initialized here because we want to be able to get the name even if the device is not initialized
    return this._name;
  }

  // **************************************** //
  // Private properties
  // **************************************** //
  private _adapterName: string;
  private _address: string = "";
  private _addressType: string = "";
  private _alias: string = "";
  private _dbus: MessageBus;
  private _deviceName: string;
  private _gattServer: GattServer | undefined = undefined;
  private _helper: BusHelper;
  private _isConnecting: boolean = false;
  private _isDisposed: boolean = false;
  private _isInitialized: boolean = false;
  private _name: string = "";

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(dbus: MessageBus, adapterName: string, deviceName: string) {
    super();
    this._dbus = dbus;
    this._adapterName = adapterName;
    this._deviceName = deviceName;
    this._helper = new BusHelper(dbus, "org.bluez", `/org/bluez/${adapterName}/${deviceName}`, "org.bluez.Device1", {
      usePropsEvents: true,
    });

    this.onPropertiesChanged = this.onPropertiesChanged.bind(this);
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    // console.log(`Device.initialize: ${this._deviceName}`);
    if (this._isInitialized) {
      throw new Error("Device already initialized");
    }

    // Initialize the helper
    await this._helper.initialize();

    // Initialize properties
    this._address = await this._helper.prop("Address");
    this._addressType = await this._helper.prop("AddressType");
    this._alias = await this._helper.prop("Alias");
    this._name = await this._helper.prop("Name");

    this._isInitialized = true;
  }

  public async dispose(): Promise<void> {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;

    // Notify anyone interested that we are disposing
    try {
      this.emit("disposing", this);
    } catch (e) {
      console.error(`Error during "disposing" emit: ${e}`);
    }

    this._isInitialized = false;

    // Remove all event handlers attached to this instance
    this.removeAllListeners();

    if (this._gattServer) {
      try {
        await this._gattServer.dispose();
      } catch (e) {
        // Ignore
      }
      this._gattServer = undefined;
    }

    try {
      await this.disconnect();
    } catch (e) {
      // Ignore
    }

    // Dispose the helper
    try {
      await this._helper.dispose();
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Received Signal Strength Indicator of the remote device
   */
  public async getRssi(): Promise<number> {
    this._assertIsInitialized();

    return this._helper.prop("RSSI");
  }

  /**
   * Advertised transmitted power level.
   */
  public async getTXPower(): Promise<number> {
    this._assertIsInitialized();

    return this._helper.prop("TxPower");
  }

  /**
   * Indicates if the remote device is paired.
   */
  public async isPaired(): Promise<boolean> {
    this._assertIsInitialized();

    return this._helper.prop("Paired");
  }

  /**
   * Indicates if the remote device is currently connected.
   */
  public async isConnected(): Promise<boolean> {
    this._assertIsInitialized();

    return this._helper.prop("Connected");
  }

  /**
   * This method will connect to the remote device
   */
  public async pair(): Promise<void> {
    this._assertIsInitialized();

    return this._helper.callMethod("Pair");
  }

  /**
   * This method can be used to cancel a pairing operation initiated by the Pair method.
   */
  public async cancelPair(): Promise<void> {
    this._assertIsInitialized();

    return this._helper.callMethod("CancelPair");
  }

  /**
   * This method will set whether the remote device is trusted.
   */
  public async trust(trusted: boolean): Promise<void> {
    this._assertIsInitialized();

    return this._helper.set("Trusted", buildTypedValue("boolean", trusted));
  }

  /**
   * Connect to remote device
   */
  public async connect(): Promise<void> {
    this._assertIsInitialized();

    if (!this._isConnecting) {
      this._isConnecting = true;

      // Listen to connect/disconnect events making sure we only add one listener
      this._helper.removeListener("properties-changed", this.onPropertiesChanged);
      this._helper.addListener("properties-changed", this.onPropertiesChanged);

      try {
        await this._helper.callMethod("Connect");
      } finally {
        this._isConnecting = false;
      }
    } else {
      throw new Error("Already connecting");
    }
  }

  /**
   * Disconnect remote device
   */
  public async disconnect(): Promise<void> {
    this._isConnecting = false;
    try {
      await this._helper.callMethod("Disconnect");
    } catch (e) {
      // NO-OP
    }
  }

  /**
   * Init a GattServer instance and return it
   */
  public async getGattServer(): Promise<GattServer> {
    this._assertIsInitialized();

    let result: GattServer | null = null;

    if (this._gattServer) {
      result = this._gattServer;
    } else {
      result = new GattServer(this._dbus, this._adapterName, this._deviceName);
      this._gattServer = result;
      await result.initialize();
    }

    return result;
  }

  /**
   * Human readable class identifier.
   */
  public toString(): string {
    return `${this.name} [${this.address}]`;
  }

  // **************************************** //
  // Protected methods
  // **************************************** //
  protected onPropertiesChanged(propertiesChanged: Record<string, Variant>): void {
    // console.log("onPropertiesChanged", propertiesChanged);

    if ("Connected" in propertiesChanged) {
      const { value } = propertiesChanged.Connected;
      if (value) {
        try {
          this.emit("connect", { connected: true });
        } catch (e) {
          console.error(`Error during "connect" emit: ${e}`);
        }
      } else {
        this._isConnecting = false;
        try {
          this.emit("disconnect", { connected: false });
        } catch (e) {
          console.error(`Error during "disconnect" emit: ${e}`);
        }
      }
    } else if ("RSSI" in propertiesChanged) {
      const { value } = propertiesChanged.RSSI;
      try {
        this.emit("rssi-changed", { rssi: value });
      } catch (e) {
        console.error(`Error during "rssi-changed" emit: ${e}`);
      }
    }
  }

  // **************************************** //
  // Private methods
  // **************************************** //
  private _assertIsInitialized(): void {
    if (!this._isInitialized) {
      throw new Error("Device not initialized");
    }
  }
}
