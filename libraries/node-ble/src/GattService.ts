import { MessageBus } from "@docbliny/dbus-next";
import { BusHelper } from "./BusHelper.js";
import { GattCharacteristic } from "./GattCharacteristic.js";

/**
 * GattService class interacts with a remote GATT service.
 *
 * @see You can construct a GattService object via {@link GattServer#getPrimaryService} method.
 */
export class GattService {
  // **************************************** //
  // Public properties
  // **************************************** //
  /**
   * List of available characteristic names.
   */
  public get characteristics(): Array<string> {
    return Object.keys(this._characteristics);
  }

  /**
   * Indicates whether or not this GATT service is a primary service.
   */
  public get isPrimary(): boolean {
    this._assertIsInitialized();

    return this._isPrimary;
  }

  public get uuid(): string {
    this._assertIsInitialized();

    return this._uuid;
  }

  // **************************************** //
  // Private properties
  // **************************************** //
  private _adapterName: string;
  private _characteristics: { [key: string]: GattCharacteristic };
  private _dbus: MessageBus;
  private _deviceName: string;
  private _helper: BusHelper;
  private _isDisposed: boolean = false;
  private _isInitialized: boolean = false;
  private _isPrimary: boolean = false;
  private _serviceName: string;
  private _uuid: string = "";

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(dbus: MessageBus, adapterName: string, deviceName: string, serviceName: string) {
    this._dbus = dbus;
    this._adapterName = adapterName;
    this._deviceName = deviceName;
    this._serviceName = serviceName;
    this._helper = new BusHelper(
      dbus,
      "org.bluez",
      `/org/bluez/${adapterName}/${deviceName}/${serviceName}`,
      "org.bluez.GattService1",
    );

    this._characteristics = {};
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    this._characteristics = {};

    // Initialize the helper
    await this._helper.initialize();

    // Initialize properties
    this._isPrimary = await this._helper.prop("Primary");
    this._uuid = await this._helper.prop("UUID");

    // Initialize characteristics
    const children: Array<string> = await this._helper.getChildren();

    for (const c of children) {
      const characteristic: GattCharacteristic = new GattCharacteristic(
        this._dbus,
        this._adapterName,
        this._deviceName,
        this._serviceName,
        c,
      );
      await characteristic.initialize();
      const uuid: string = characteristic.uuid;
      this._characteristics[uuid] = characteristic;
    }

    this._isInitialized = true;
  }

  public async dispose(): Promise<void> {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;

    this._isInitialized = false;

    // Dispose characteristics
    for (const characteristic of Object.values(this._characteristics)) {
      try {
        await characteristic.dispose();
      } catch (e) {
        // Ignore
      }
    }

    // Dispose the helper
    try {
      await this._helper.dispose();
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Init a GattCharacteristic instance and return it
   *
   * @param uuid - Characteristic UUID.
   */
  public getCharacteristic(uuid: string): GattCharacteristic {
    this._assertIsInitialized();

    if (uuid in this._characteristics) {
      return this._characteristics[uuid];
    }

    throw new Error("Characteristic not available");
  }

  /**
   * Human readable class identifier.
   */
  public toString(): string {
    return this.uuid;
  }

  // **************************************** //
  // Private methods
  // **************************************** //
  private _assertIsInitialized(): void {
    if (!this._isInitialized) {
      throw new Error("GattServer not initialized");
    }
  }
}
