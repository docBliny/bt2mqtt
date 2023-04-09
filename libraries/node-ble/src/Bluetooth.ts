import { BusHelper } from "./BusHelper.js";
import { Adapter } from "./Adapter.js";
import { MessageBus, systemBus } from "@docbliny/dbus-next";

/**
 * Top level object that represent a bluetooth session
 *
 * @see You can construct a Bluetooth session via {@link createBluetooth} function
 */
export class Bluetooth {
  // **************************************** //
  // Private properties
  // **************************************** //
  private _dbus: MessageBus;
  private _helper: BusHelper;
  private _isDisposed: boolean = false;
  private _isInitialized: boolean = false;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(dbus?: MessageBus) {
    if (!dbus) {
      this._dbus = systemBus();
    } else {
      this._dbus = dbus;
    }

    this._helper = new BusHelper(this._dbus, "org.bluez", "/org/bluez", "org.bluez.AgentManager1", { useProps: false });
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      throw new Error("Bluetooth already initialized");
    }

    // Initialize the helper
    await this._helper.initialize();

    // Initialize properties
    this._isInitialized = true;
  }

  public async dispose(): Promise<void> {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;

    this._isInitialized = false;

    try {
      await this._helper.dispose();
    } catch (e) {
      // Ignore
    }

    try {
      this._dbus.disconnect();
    } catch (e) {
      // Ignore
    }
  }

  /**
   *  Get a list of available adapter names.
   */
  public async getAdapters(): Promise<Array<string>> {
    this._assertIsInitialized();

    return await this._helper.getChildren();
  }

  /**
   * Get first available adapter.
   *
   * @throws Will throw an error if there aren't available adapters.
   */
  public async getDefaultAdapter(): Promise<Adapter> {
    this._assertIsInitialized();

    const adapters: Array<string> = await this.getAdapters();
    if (!adapters.length) {
      throw new Error("No available adapters found");
    }

    return this.getAdapter(adapters[0]);
  }

  /**
   * Init an adapter instance and returns it.
   *
   * @param adapterName - Name of an adapter
   * @throws Will throw if adapter not found, for example if the provided name isn't valid.
   *
   */
  public async getAdapter(adapterName: string): Promise<Adapter> {
    this._assertIsInitialized();

    const adapters: Array<string> = await this.getAdapters();
    if (!adapters.includes(adapterName)) {
      throw new Error("Adapter not found");
    }

    return new Adapter(this._dbus, adapterName);
  }

  /**
   * List all available (powered) adapters
   */
  public async getActiveAdapters(): Promise<Array<Adapter>> {
    this._assertIsInitialized();

    const adapterNames: Array<string> = await this.getAdapters();
    const allAdapters: Array<{ adapter: Adapter; isPowered: boolean }> = [];

    for (const name of adapterNames) {
      const adapter: Adapter = await this.getAdapter(name);
      const isPowered: boolean = await adapter.getIsPowered();
      allAdapters.push({ adapter, isPowered });
    }

    return allAdapters.filter((item) => item.isPowered).map((item) => item.adapter);
  }

  // **************************************** //
  // Private methods
  // **************************************** //
  private _assertIsInitialized(): void {
    if (!this._isInitialized) {
      throw new Error("Bluetooth not initialized");
    }
  }
}
