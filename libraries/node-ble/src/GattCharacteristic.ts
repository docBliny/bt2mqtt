import { EventEmitter } from "node:events";
import { BusHelper } from "./BusHelper.js";
import { buildTypedValue } from "./buildTypedValue.js";
import { MessageBus, Variant } from "@docbliny/dbus-next";

export type WriteType = "command" | "request" | "reliable";
export interface IWriteOptions {
  offset: number;
  type: WriteType;
}

export interface ICallOptions {
  offset?: Variant<number>;
  type?: Variant<string>;
}

/**
 * GattCharacteristic class interacts with a GATT characteristic.
 *
 * @see You can construct a GattCharacteristic object via {@link GattService#getCharacteristic} method.
 */
export class GattCharacteristic extends EventEmitter {
  // **************************************** //
  // Public properties
  // **************************************** //
  public get flags(): Array<string> {
    this._assertIsInitialized();

    return this._flags;
  }

  public get uuid(): string {
    this._assertIsInitialized();

    return this._uuid;
  }

  // **************************************** //
  // Private properties
  // **************************************** //
  private _flags: Array<string> = [];
  private _helper: BusHelper;
  private _isDisposed: boolean = false;
  private _isInitialized: boolean = false;
  private _uuid: string = "";

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(dbus: MessageBus, adapterName: string, deviceName: string, serviceName: string, characteristic: string) {
    super();
    this._helper = new BusHelper(
      dbus,
      "org.bluez",
      `/org/bluez/${adapterName}/${deviceName}/${serviceName}/${characteristic}`,
      "org.bluez.GattCharacteristic1",
      { usePropsEvents: true },
    );

    this.onPropertiesChanged = this.onPropertiesChanged.bind(this);
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      throw new Error("GattCharacteristic already initialized");
    }

    // Initialize the helper
    await this._helper.initialize();

    // Initialize properties
    this._flags = await this._helper.prop("Flags");
    this._uuid = await this._helper.prop("UUID");

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

    // Dispose the helper
    try {
      await this._helper.dispose();
    } catch (e) {
      // Ignore
    }
  }

  /**
   * True, if notifications or indications on this characteristic are currently enabled.
   */
  public async getIsNotifying(): Promise<boolean> {
    this._assertIsInitialized();

    return this._helper.prop("Notifying");
  }

  /**
   * Read the value of the characteristic.
   *
   * @param offset - Default 0.
   */
  public async readValue(offset: number = 0): Promise<Buffer> {
    this._assertIsInitialized();

    const options: ICallOptions = {
      offset: buildTypedValue("uint16", offset),
    };
    const payload = await this._helper.callMethod("ReadValue", options);
    return Buffer.from(payload);
  }

  /**
   * Write the value of the characteristic.
   *
   * @param value - Buffer containing the characteristic value.
   * @param optionsOrOffset - Starting offset or writing options. Default 0.
   */
  public async writeValue(value: Buffer, optionsOrOffset: number | IWriteOptions): Promise<any> {
    this._assertIsInitialized();

    if (!Buffer.isBuffer(value)) {
      throw new Error("Only buffers can be written to a characteristic");
    }

    const options: Partial<IWriteOptions> = typeof optionsOrOffset === "number" ? { offset: optionsOrOffset } : optionsOrOffset;
    const mergedOptions: IWriteOptions = {
      offset: 0,
      type: "reliable",
      ...options,
    };

    const callOptions: ICallOptions = {
      offset: buildTypedValue("uint16", mergedOptions.offset),
      type: buildTypedValue("string", mergedOptions.type),
    };

    const { data } = value.toJSON();
    await this._helper.callMethod("WriteValue", data, callOptions);
  }

  /**
   * Write the value of the characteristic without waiting for the response.
   * @param value - Buffer containing the characteristic value.
   * @param  offset - Starting offset. Default 0.
   */
  public async writeValueWithoutResponse(value: Buffer, offset: number = 0): Promise<any> {
    return this.writeValue(value, { offset, type: "command" });
  }

  /**
   * Write the value of the characteristic and wait for the response.
   * @param value - Buffer containing the characteristic value.
   * @param  offset - Starting offset. Default 0.
   */
  public async writeValueWithResponse(value: Buffer, offset: number = 0): Promise<any> {
    return this.writeValue(value, { offset, type: "request" });
  }

  /**
   * Starts a notification session from this characteristic.
   *
   * It emits value-changed event when receives a notification.
   */
  public async startNotifications(): Promise<void> {
    this._assertIsInitialized();

    await this._helper.callMethod("StartNotify");

    this._helper.addListener("properties-changed", this.onPropertiesChanged);
  }

  public async stopNotifications(): Promise<void> {
    this._assertIsInitialized();

    try {
      await this._helper.callMethod("StopNotify");
    } finally {
      this._helper.removeAllListeners("properties-changed");
    }
  }

  public toString(): string {
    return this.uuid;
  }

  // **************************************** //
  // Protected methods
  // **************************************** //
  protected onPropertiesChanged(propertiesChanged: Record<string, Variant>): void {
    if ("Value" in propertiesChanged) {
      const { value } = propertiesChanged.Value;
      try {
        this.emit("value-changed", Buffer.from(value));
      } catch (e) {
        console.error(`Error during "value-changed" emit: ${e}`);
      }
    }
  }

  // **************************************** //
  // Private methods
  // **************************************** //
  private _assertIsInitialized(): void {
    if (!this._isInitialized) {
      throw new Error("GattCharacteristic not initialized");
    }
  }
}
