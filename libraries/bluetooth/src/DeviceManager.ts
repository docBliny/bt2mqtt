import { Adapter, Bluetooth, Device } from "@docbliny/node-ble";
import { timeout, TimeoutError } from "promise-timeout";
import EventEmitter from "node:events";
import { DeviceBase } from "./DeviceBase.js";
import { Colors, type ITerminal } from "@rushstack/node-core-library";
import { PrefixedTerminal } from "./PrefixedTerminal.js";

export interface IBluetoothCommand {
  command: () => Promise<void>;
  maxRetries: number;
  name: string;
}

export interface IDeviceManagerOptions {
  discoveryInterval: number;
  discoveryTimeout: number;
  maxConnectRetries: number;
}

export interface IStartOptions {
  adapterName?: string;
  macAddresses: Array<string>;
}

export interface IQueuedBluetoothCommand extends IBluetoothCommand {
  retryCount: number;
}

export class DeviceManager extends EventEmitter {
  // **************************************** //
  // Public properties
  // **************************************** //
  public readonly devices: Record<string, DeviceBase> = {};

  // **************************************** //
  // Protected properties
  // **************************************** //
  protected adapterName: string | undefined = undefined;
  protected adapter: Adapter | undefined = undefined;
  protected bluetooth: Bluetooth | undefined = undefined;
  protected readonly bluetoothCommandQueue: Array<IQueuedBluetoothCommand> = [];
  protected isDisposed: boolean = false;
  protected isExecuting: boolean = false;
  protected readonly options: IDeviceManagerOptions;
  protected readonly terminal: PrefixedTerminal;
  protected desiredDevices: Array<string> = [];

  // **************************************** //
  // Private properties
  // **************************************** //
  private _connectRetryCounts: Record<string, number> = {};

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(terminal: ITerminal, options: IDeviceManagerOptions) {
    super();

    this.terminal = new PrefixedTerminal(terminal, "DeviceManager");
    this.terminal.writeVerboseLine("constructor()");

    this.bluetooth = new Bluetooth();
    this.options = options;

    this.onDeviceAdded = this.onDeviceAdded.bind(this);
    this.onDeviceConnected = this.onDeviceConnected.bind(this);
    this.onDeviceDisconnected = this.onDeviceDisconnected.bind(this);
    this.onDeviceDispose = this.onDeviceDispose.bind(this);
    this.onDeviceRemoved = this.onDeviceRemoved.bind(this);
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    await this.bluetooth?.initialize();
  }

  public async executeCommand(command: IBluetoothCommand): Promise<void> {
    this.terminal.writeDebugLine("executeCommand(", Colors.blue(`${command.name}`), ")");

    // Create queue item
    this.bluetoothCommandQueue.push({
      ...command,
      retryCount: 0,
    });

    await this.dequeue();
  }

  public async dequeue(): Promise<void> {
    this.terminal.writeVerboseLine(
      "dequeue(). isExecuting=",
      Colors.blue(`${this.isExecuting}`),
      ", queueLength=",
      Colors.blue(`${this.bluetoothCommandQueue.length}`),
    );

    if (this.isDisposed) {
      this.terminal.writeDebugLine("dequeue() - DeviceManager is disposed. Ignoring dequeue request.");
      return;
    }

    if (!this.isExecuting && this.bluetoothCommandQueue.length > 0) {
      this.isExecuting = true;
      let queueItem: IQueuedBluetoothCommand | undefined = undefined;
      try {
        queueItem = this.bluetoothCommandQueue.shift();
        if (queueItem) {
          queueItem.retryCount++;
          await queueItem.command();
        }
      } catch (e) {
        this.terminal.writeErrorLine(`Error executing write function: ${e}`);

        // Check if the connection has been lost
        if (!e.message.includes("Not connected")) {
          if (queueItem && queueItem.retryCount < queueItem.maxRetries) {
            this.terminal.writeDebugLine("Retrying write function. Retry count: ", Colors.yellow(`${queueItem.retryCount}`));
            this.bluetoothCommandQueue.unshift(queueItem);
          }
        }
      } finally {
        this.isExecuting = false;
      }

      // Recurse in a delayed fashion
      setImmediate(async () => {
        // Need to catch errors as we've effectively got a hanging promise
        try {
          await this.dequeue();
        } catch (e) {
          this.terminal.writeErrorLine("Error dequeuing: ", e);
        }
      });
    }
  }

  public async waitUntilDevicesFound(): Promise<void> {
    const { discoveryInterval, discoveryTimeout } = this.options;
    this.terminal.writeVerboseLine(`waitUntilDevicesFound(${JSON.stringify(this.options)})`);
    let interval: NodeJS.Timer | undefined = undefined;

    const blockUntilFound = new Promise<void>((resolve, reject) => {
      // Check immediately if we have found all devices
      if (this.haveFoundAllDevices(this.desiredDevices)) {
        resolve();
      } else {
        // Don't have all devices yet, so start polling
        interval = setInterval(() => {
          if (this.haveFoundAllDevices(this.desiredDevices)) {
            resolve();
          }
        }, discoveryInterval);
      }
    });

    if (this.adapter) {
      this.terminal.writeVerboseLine(`Checking discovery status on adapter "`, Colors.yellow(this.adapterName || ""), `"...`);
      if (!(await this.adapter.getIsDiscovering())) {
        this.terminal.writeLine(`Starting discovery on adapter "`, Colors.yellow(this.adapterName || ""), `"...`);
        await this.adapter.startDiscovery();
      }

      // Wait until all devices are found or timeout
      try {
        await timeout(blockUntilFound, discoveryTimeout);
      } catch (e) {
        if (e instanceof TimeoutError) {
          this.terminal.writeErrorLine("Timeout finding devices.");
        } else {
          this.terminal.writeErrorLine("Error finding devices: ", e);
        }
      } finally {
        if (interval) {
          clearInterval(interval);
        }
      }
    } else {
      this.terminal.writeErrorLine("No adapter available.");
      throw new Error("No adapter available.");
    }
  }

  public haveFoundAllDevices(macAddresses: Array<string>): boolean {
    // this.terminal.writeVerboseLine("haveFoundAllDevices()");
    return macAddresses.every((macAddress: string) => this.containsDeviceByMacAddress(macAddress));
  }

  public addDevice(device: DeviceBase): void {
    this.terminal.writeVerboseLine("addDevice(", Colors.yellow(device.address), ")");

    if (this.devices[device.address]) {
      this.terminal.writeWarningLine(Colors.yellow("Ignoring existing device "), Colors.yellow(Colors.bold(device.address)));
    } else {
      device.addListener("connect", this.onDeviceConnected);
      device.addListener("disconnect", this.onDeviceDisconnected);
      device.addListener("dispose", this.onDeviceDispose);
      this.devices[device.address] = device;
    }
  }

  public async removeDevice(device: DeviceBase): Promise<void> {
    this.terminal.writeVerboseLine("removeDevice(", Colors.yellow(device.address), ")");

    device.removeListener("connect", this.onDeviceConnected);
    device.removeListener("disconnect", this.onDeviceDisconnected);
    device.removeListener("dispose", this.onDeviceDisconnected);
    delete this.devices[device.address];
  }

  public async reconnectDevice(address: string): Promise<void> {
    this.terminal.writeVerboseLine("reconnectDevice(", Colors.yellow(address), ")");

    // Check if we should try to reconnect
    if (
      this.options.maxConnectRetries === -1 ||
      !this._connectRetryCounts[address] ||
      this._connectRetryCounts[address] <= this.options.maxConnectRetries
    ) {
      this._connectRetryCounts[address] = (this._connectRetryCounts[address] || 0) + 1;
      this.terminal.writeDebugLine(
        "Reconnecting to device ",
        Colors.yellow(address),
        " (attempt ",
        Colors.blue(`${this._connectRetryCounts[address]}`),
        " of ",
        Colors.blue(`${this.options.maxConnectRetries}`),
        ")",
      );

      // Check if we need to restart discovery
      if (this.adapter?.availableDeviceUuids.includes(address)) {
        this.terminal.writeDebugLine("Device is still available. Not restarting discovery.");
        await this.executeCommand({
          command: async () => {
            await this.onDeviceAdded(address);
          },
          name: "Reconnect",
          maxRetries: 0,
        });
      } else {
        this.terminal.writeDebugLine("Device is no longer available. Restarting discovery.");
        await Promise.all([this.waitUntilDevicesFound()]);
      }
    }
  }

  public containsDeviceByMacAddress(macAddress: string): boolean {
    // this.terminal.writeVerboseLine("containsDeviceByMacAddress(", Colors.yellow(macAddress), ")");

    return this.devices[macAddress] !== undefined;
  }

  public async getAdapters(): Promise<Array<string>> {
    this.terminal.writeVerboseLine("getAdapters()");
    return await this.bluetooth!.getAdapters();
  }

  public async start(options: IStartOptions): Promise<void> {
    const { adapterName, macAddresses } = options;
    this.terminal.writeDebugLine(`start(adapterName="`, Colors.yellow(adapterName || ""), `")`);
    if (!this.bluetooth || this.isDisposed) {
      throw new Error("Cannot start after dispose.");
    }

    // Update the devices we are looking for
    this.desiredDevices = macAddresses;

    // Get Bluetooth adapter to use
    this.adapterName = adapterName || "";
    if (!adapterName) {
      this.terminal.writeVerboseLine("Getting default adapter...");
      this.adapter = await this.bluetooth.getDefaultAdapter();
    } else {
      this.terminal.writeVerboseLine(`Getting adapter "`, Colors.yellow(this.adapterName || ""), `"...`);
      this.adapter = await this.bluetooth.getAdapter(this.adapterName);
    }

    // Hook up event listeners to adapter
    this.adapter.addListener("device-added", this.onDeviceAdded);
    this.adapter.addListener("device-removed", this.onDeviceRemoved);

    // Initialize adapter
    await this.adapter.initialize();

    this.adapterName = this.adapter.name || "(default)";
    if (this.adapterName === "undefined") {
      this.adapterName = "(default)";
    }

    await this.waitUntilDevicesFound();
  }

  public async stopDiscovery(): Promise<void> {
    try {
      if (this.adapter && (await this.adapter.getIsDiscovering())) {
        this.terminal.writeLine(`Stopping discovery on adapter "`, Colors.yellow(this.adapterName || ""), `"...`);
        await this.adapter.stopDiscovery();
      }
    } catch (e) {
      this.terminal.writeErrorLine(`Error stopping discovery on adapter "`, Colors.bold(this.adapterName || ""), `": ${e}`);
    }
  }

  public async dispose(): Promise<void> {
    this.terminal.writeDebugLine("dispose()");
    this.isDisposed = true;

    // Remove all event handlers attached to this instance
    this.removeAllListeners();

    // Clear queue
    this.bluetoothCommandQueue.length = 0;

    // Remove event listeners from adapter
    this.adapter?.removeListener("device-added", this.onDeviceAdded);
    this.adapter?.removeListener("device-removed", this.onDeviceRemoved);

    // Stop discovery
    try {
      if (this.adapter && (await this.adapter.getIsDiscovering())) {
        await this.adapter.stopDiscovery();
        this.terminal.writeDebugLine(Colors.green("Discovery stopped"));
      }
    } catch (e) {
      this.terminal.writeErrorLine(`Error stopping discovery on adapter "`, Colors.bold(this.adapterName || ""), `": ${e}`);
    }

    // Disconnect from all devices
    this.terminal.writeDebugLine("Disconnecting from devices...");
    for (const address of Object.keys(this.devices)) {
      const device = this.devices[address];

      if (device) {
        try {
          // Try to dispose which will disconnect
          await device.dispose();
        } catch (e) {
          this.terminal.writeErrorLine("Error disconnecting from device ", Colors.bold(device.address), `: ${e}`);
        }

        // Remove all listeners
        device.removeAllListeners();
      }
    }

    // Empty devices object
    Object.keys(this.devices).forEach((key) => delete this.devices[key]);

    try {
      await this.adapter?.dispose();
    } catch (e) {
      this.terminal.writeErrorLine(`Error disposing adapter: ${e}`);
    }

    // Destroy
    try {
      if (this.bluetooth !== undefined) {
        await this.bluetooth.dispose();
        this.terminal.writeLine(Colors.green("Bluetooth disposed"));
      } else {
        this.terminal.writeVerboseLine("No Bluetooth to dispose.");
      }
    } catch (e) {
      this.terminal.writeErrorLine(`Error disposing Bluetooth: ${e}`);
    } finally {
      this.bluetooth = undefined;
    }
  }

  // **************************************** //
  // Protected methods, events handlers
  // **************************************** //
  protected async onDeviceAdded(uuid: string): Promise<void> {
    // this.terminal.writeVerboseLine("onDeviceAdded(", Colors.yellow(uuid), ")");

    // Check if this is a device we're interested in
    if (this.desiredDevices.includes(uuid)) {
      this.terminal.writeVerboseLine("Found desired device ", Colors.yellow(uuid));
      let device: Device | undefined;

      try {
        device = await this.adapter?.getDevice(uuid);
      } catch (e) {
        this.terminal.writeErrorLine("Error getting device ", Colors.bold(uuid), `: ${e}`);
        device = undefined;
      }

      if (!device) {
        this.terminal.writeErrorLine("Unable to get device ", Colors.bold(uuid));

        // TODO: Need to retry
      } else {
        try {
          this.terminal.writeVerboseLine("Trusting device ", Colors.yellow(device.address));
          await device.trust(true);

          this.emit("device-available", device);
        } catch (e) {
          this.terminal.writeErrorLine("Error trusting device/device-available emit ", Colors.bold(uuid), `: ${e}`);

          // Dispose device?
        }
      }
    }
  }

  protected async onDeviceConnected(device: DeviceBase): Promise<void> {
    // TODO: Clearing the retry most often results in infinite retries as errors often happen after reconnect
    // this._connectRetryCounts[device.address] = 0;
  }

  protected async onDeviceDisconnected(device: DeviceBase): Promise<void> {
    // this.terminal.writeVerboseLine("onDeviceDisconnected(", Colors.yellow(device.address), ")");
    try {
      await this.removeDevice(device);
    } catch (e) {
      this.terminal.writeErrorLine("onDeviceDisconnected - removeDevice", Colors.bold(device.address), `: ${e}`);
    }
  }

  protected async onDeviceDispose(device: DeviceBase): Promise<void> {
    const address = device.address;
    this.terminal.writeVerboseLine("onDeviceDispose(", Colors.yellow(address), ")");
    try {
      await this.removeDevice(device);
    } catch (e) {
      this.terminal.writeErrorLine("onDeviceDispose - removeDevice", Colors.bold(address), `: ${e}`);
    }

    try {
      // Reconnect unless we're disposed
      if (!this.isDisposed) {
        await this.reconnectDevice(address);
      }
    } catch (e) {
      this.terminal.writeErrorLine("onDeviceDispose - reconnectDevice", Colors.bold(address), `: ${e}`);
    }
  }

  protected async onDeviceRemoved(uuid: string): Promise<void> {
    // this.terminal.writeVerboseLine("onDeviceRemoved(", Colors.yellow(uuid), ")");

    try {
      // Remove device
      const device: DeviceBase | undefined = this.devices[uuid];
      if (device) {
        await this.removeDevice(device);

        this.emit("device-unavailable", uuid);
      }
    } catch (e) {
      this.terminal.writeErrorLine("onDeviceRemoved", Colors.bold(uuid), `: ${e}`);
    }
  }
}
