import { MessageBus } from "@docbliny/dbus-next";
import { BusHelper } from "./BusHelper.js";
import { GattService } from "./GattService.js";

/**
 * GattServer class that provides interaction with device GATT profile.
 *
 * @see You can construct a Device object via {@link Device#gatt} method
 */
export class GattServer {
  // **************************************** //
  // Public properties
  // **************************************** //
  /**
   * List of available services
   */
  public get serviceUuids(): Array<string> {
    return Object.keys(this._services);
  }

  // **************************************** //
  // Private properties
  // **************************************** //
  private _adapterName: string;
  private _dbus: MessageBus;
  private _deviceName: string;
  private _helper: BusHelper;
  private _isDisposed: boolean = false;
  private _isInitialized: boolean = false;
  private _services: Record<string, GattService>;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(dbus: MessageBus, adapterName: string, deviceName: string) {
    this._dbus = dbus;
    this._adapterName = adapterName;
    this._deviceName = deviceName;
    this._helper = new BusHelper(dbus, "org.bluez", `/org/bluez/${adapterName}/${deviceName}`, "org.bluez.Device1");

    this._services = {};
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    // TODO add lock to avoid race conditions
    this._services = {};

    // Initialize the helper
    await this._helper.initialize();

    // Resolve available services
    const servicesResolved: boolean = await this._helper.prop("ServicesResolved");
    if (!servicesResolved) {
      // console.log("Services not resolved, waiting for ServicesResolved property change");
      await this._helper.waitPropChange("ServicesResolved");
    }

    const children: Array<string> = await this._helper.getChildren();
    for (const s of children) {
      const service: GattService = new GattService(this._dbus, this._adapterName, this._deviceName, s);
      await service.initialize();
      const uuid: string = service.uuid;
      this._services[uuid] = service;
    }

    this._isInitialized = true;
  }

  public async dispose(): Promise<void> {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;

    this._isInitialized = false;

    // Dispose all services
    for (const service of Object.values(this._services)) {
      try {
        await service.dispose();
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
   * Get the service with the given UUID.
   *
   * @param serviceUuid - Service UUID.
   */
  public getService(serviceUuid: string): GattService {
    this._assertIsInitialized();

    if (serviceUuid in this._services) {
      return this._services[serviceUuid];
    }

    throw new Error("Service not available");
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
