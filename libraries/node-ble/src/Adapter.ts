import EventEmitter from "node:events";
import type { ClientInterface, MessageBus, ProxyObject, Variant } from "@docbliny/dbus-next";

import { Device } from "./Device.js";
import { BusHelper } from "./BusHelper.js";
import { buildTypedValue } from "./buildTypedValue.js";

const DBUS_SERVICE_NAME: string = "org.bluez";

/**
 * Adapter class interacts with the local bluetooth adapter
 *
 * @see You can construct an Adapter session via {@link Bluetooth#getAdapter} method
 */
export class Adapter extends EventEmitter {
  // **************************************** //
  // Public properties
  // **************************************** //
  public get address(): string {
    this._assertIsInitialized();

    return this._address;
  }

  public get addressType(): string {
    this._assertIsInitialized();

    return this._addressType;
  }

  public get alias(): string {
    this._assertIsInitialized();

    return this._alias;
  }

  /**
   * List of found device names (uuid).
   */
  public get availableDeviceUuids(): Array<string> {
    this._assertIsInitialized();

    return this._availableDeviceIds.map(Adapter.deserializeDeviceIdToUuid);
  }

  public get name(): string {
    this._assertIsInitialized();

    return this._name;
  }

  // **************************************** //
  // Private properties
  // **************************************** //
  private _adapterName: string;
  private _address: string = "";
  private _addressType: string = "";
  private _availableDeviceIds: Array<string> = [];
  private _alias: string = "";
  private _dbus: MessageBus;
  private _devices: Record<string, Device> = {};
  private _helper: BusHelper;
  private _isDisposed: boolean = false;
  private _isInitialized: boolean = false;
  private _name: string = "";
  private _objectProxy: ProxyObject | undefined;
  private _objectManager: ClientInterface | undefined;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(dbus: MessageBus, adapterName: string) {
    super();

    this._dbus = dbus;
    this._adapterName = adapterName;
    this._helper = new BusHelper(dbus, DBUS_SERVICE_NAME, `/org/bluez/${adapterName}`, "org.bluez.Adapter1", {
      useProps: true,
      usePropsEvents: true,
    });

    this._onDBusInterfacesAdded = this._onDBusInterfacesAdded.bind(this);
    this._onDBusInterfacesRemoved = this._onDBusInterfacesRemoved.bind(this);
  }

  // **************************************** //
  // Public static methods
  // **************************************** //
  public static serializeUuidToDeviceId(uuid: string): string {
    return `dev_${uuid.replace(/:/g, "_")}`;
  }

  public static deserializeDeviceIdToUuid(uuid: string): string {
    return uuid.substring(4).replace(/_/g, ":");
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      throw new Error("Adapter already initialized");
    }

    // Initialize the helper
    await this._helper.initialize();

    // Get properties
    this._address = await this._helper.prop("Address");
    this._addressType = await this._helper.prop("AddressType");
    this._alias = await this._helper.prop("Alias");
    this._name = await this._helper.prop("Name");
    this._availableDeviceIds = await this._helper.getChildren();

    // Create the object manager to listen to interface added/removed events
    this._objectProxy = await this._dbus.getProxyObject(DBUS_SERVICE_NAME, "/");
    this._objectManager = await this._objectProxy.getInterface("org.freedesktop.DBus.ObjectManager");

    // Hook up event handlers
    this._objectManager!.addListener("InterfacesAdded", this._onDBusInterfacesAdded);
    this._objectManager!.addListener("InterfacesRemoved", this._onDBusInterfacesRemoved);

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

    // Remove event handlers that we attached to the object manager
    this._objectManager?.removeAllListeners();
    this._objectManager = undefined;
    this._objectProxy = undefined;

    // Dispose the helper
    try {
      await this._helper.dispose();
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Initialize and return a Device instance.
   *
   * @param uuid - Device Name.
   *
   * @returns A Device instance.
   * @throws Will throw an error if the device is not available.
   */
  public async getDevice(uuid: string): Promise<Device> {
    this._assertIsInitialized();
    let result: Device | undefined = this._devices[uuid];

    if (!result) {
      const serializedUuid: string = Adapter.serializeUuidToDeviceId(uuid);

      // Check if the device is available
      if (!this._availableDeviceIds.includes(serializedUuid)) {
        throw new Error(`Device ${serializedUuid} not available`);
      }

      // Create a new device instance
      result = new Device(this._dbus, this._adapterName, serializedUuid);

      // Save the device reference
      this._devices[uuid] = result;

      // Listen to disposing events so we can remove the device from our list
      result.on("disposing", (device: Device) => {
        delete this._devices[uuid];
      });

      // Initialize the device
      await result.initialize();
    }

    return result;
  }

  public async removeDevice(deviceId: string): Promise<void> {
    const deviceUuid: string = Adapter.deserializeDeviceIdToUuid(deviceId);

    // Remove from available list
    this._availableDeviceIds = this._availableDeviceIds.filter((id: string) => id !== deviceId);

    // Check if a device instance exists and dispose it
    const device: Device | undefined = this._devices[deviceUuid];
    if (device) {
      delete this._devices[deviceUuid];
      try {
        await device.dispose();
      } catch (e) {
        console.error(`Unable to dispose device ${deviceUuid}: ${e}`);
      }
    }

    try {
      this.emit("device-removed", deviceUuid);
    } catch (e) {
      console.error(`Error during "device-removed" emit: ${e}`);
    }
  }

  /**
   * Indicates that a device discovery procedure is active.
   */
  public async getIsDiscovering(): Promise<boolean> {
    return this._helper.prop("Discovering");
  }

  /**
   * Current adapter state.
   */
  public async getIsPowered(): Promise<boolean> {
    return this._helper.prop("Powered");
  }

  /**
   * This method starts the device discovery session.
   */
  public async startDiscovery(): Promise<void> {
    this._assertIsInitialized();

    if (await this.getIsDiscovering()) {
      throw new Error("Discovery already in progress");
    }

    // Trigger raising events for existing devices
    for (const deviceId of this._availableDeviceIds) {
      try {
        this.emit("device-added", Adapter.deserializeDeviceIdToUuid(deviceId));
      } catch (e) {
        console.error(`Error during "device-added" emit: ${e}`);
      }
    }

    await this._helper.callMethod("SetDiscoveryFilter", {
      Transport: buildTypedValue("string", "le"),
    });

    await this._helper.callMethod("StartDiscovery");
  }

  /**
   * This method will cancel any previous StartDiscovery transaction.
   */
  public async stopDiscovery(): Promise<void> {
    this._assertIsInitialized();

    if (!(await this.getIsDiscovering())) {
      throw new Error("No discovery started");
    }
    await this._helper.callMethod("StopDiscovery");
  }

  // /**
  //  * Wait that a specific device is found, then init a device instance and returns it.
  //  *
  //  * @param uuid - Device Name.
  //  * @param timeout - Time (ms) to wait before throwing a timeout expection. Default 120000.
  //  * @param discoveryInterval - Interval (ms) frequency that verifies device availability. Default 1000.
  //  */
  // public async waitDevice(
  //   uuid: string,
  //   timeout: number = DEFAULT_TIMEOUT,
  //   discoveryInterval: number = DEFAULT_DISCOVERY_INTERVAL,
  // ): Promise<Device | undefined> {
  //   this._assertIsInitialized();
  //   console.log(`Waiting for device ${uuid}...`);
  //   // this should be optimized subscribing InterfacesAdded signal

  //   const cancellable: Array<() => void> = [];
  //   const discoveryHandler: Promise<Device | undefined> = new Promise<Device | undefined>((resolve, reject) => {
  //     const check = (): void => {
  //       this.getDevice(uuid)
  //         .then((device: Device) => {
  //           resolve(device);
  //         })
  //         .catch((error: Error) => {
  //           console.error(`Unable to get device: ${error}`);
  //           resolve(undefined);
  //         });
  //     };

  //     const handler: NodeJS.Timer = setInterval(check, discoveryInterval);
  //     cancellable.push(() => clearInterval(handler));
  //   });

  //   const timeoutHandler: Promise<undefined> = new Promise<undefined>((resolve, reject) => {
  //     const handler: NodeJS.Timeout = setTimeout(() => {
  //       reject(new Error("operation timed out"));
  //     }, timeout);

  //     cancellable.push(() => clearTimeout(handler));
  //   });

  //   const device: Device | undefined = await Promise.race<Device | undefined>([discoveryHandler, timeoutHandler]);

  //   for (const cancel of cancellable) {
  //     cancel();
  //   }

  //   return device;
  // }

  /**
   * Human readable class identifier.
   */
  public toString(): string {
    return `${this.name} [${this.address}]`;
  }

  // **************************************** //
  // Protected methods
  // **************************************** //
  protected async _onDBusInterfacesAdded(path: string, interfaces: Record<string, Record<string, Variant>>): Promise<void> {
    // console.log("InterfacesAdded", path, interfaces);

    if (interfaces["org.bluez.Device1"]) {
      const deviceId: string = path.split("/").pop()!;
      this._addAvailableDevice(deviceId);
    }
  }

  protected async _onDBusInterfacesRemoved(path: string, interfaces: Array<string>): Promise<void> {
    // console.log("InterfacesRemoved", path, interfaces);

    if (interfaces.includes("org.bluez.Device1")) {
      const deviceId: string = path.split("/").pop()!;
      await this.removeDevice(deviceId);
    }
  }

  // **************************************** //
  // Private methods
  // **************************************** //
  private _assertIsInitialized(): void {
    if (!this._isInitialized) {
      throw new Error("Adapter not initialized");
    }
  }

  private _addAvailableDevice(deviceId: string): void {
    if (!this._availableDeviceIds.includes(deviceId)) {
      this._availableDeviceIds.push(deviceId);

      try {
        this.emit("device-added", Adapter.deserializeDeviceIdToUuid(deviceId));
      } catch (e) {
        console.error(`Error during "device-added" emit: ${e}`);
      }
    }
  }
}
