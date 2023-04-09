import { EventEmitter } from "node:events";
import type { ClientInterface, MessageBus, ProxyObject, Variant } from "@docbliny/dbus-next";

export interface IBusHelperOptions {
  useProps: boolean;
  usePropsEvents: boolean;
}

const DEFAULT_OPTIONS: IBusHelperOptions = {
  useProps: true,
  usePropsEvents: false,
};

export class BusHelper extends EventEmitter {
  // **************************************** //
  // Private properties
  // **************************************** //
  private _dbus: MessageBus;
  private _interfaceName: string;
  private _interfaceProxy: ClientInterface | undefined = undefined;
  private _isDisposed: boolean = false;
  private _isInitialized: boolean = false;
  private _objectName: string;
  private _objectProxy: ProxyObject | undefined = undefined;
  private _options: IBusHelperOptions;
  private _propsProxy: ClientInterface | undefined = undefined;
  private _serviceName: string;

  // **************************************** //
  // Constructors
  // **************************************** //
  public constructor(
    dbus: MessageBus,
    serviceName: string,
    objectName: string,
    interfaceName: string,
    options: IBusHelperOptions | {} = {},
  ) {
    super();

    this._serviceName = serviceName;
    this._objectName = objectName;
    this._interfaceName = interfaceName;

    this._dbus = dbus;

    this._options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    this._onPropertiesChanged = this._onPropertiesChanged.bind(this);
  }

  // **************************************** //
  // Public static methods
  // **************************************** //
  public static buildChildren(path: string, nodes: Array<string>): Array<string> {
    if (path === "/") path = "";
    const children: Set<string> = new Set();
    for (const node of nodes) {
      if (!node.startsWith(path)) {
        continue;
      }

      const end: number = node.indexOf("/", path.length + 1);
      const sub: string = end >= 0 ? node.substring(path.length + 1, end) : node.substring(path.length + 1);
      if (sub.length < 1) continue;

      children.add(sub);
    }
    return Array.from(children.values());
  }

  // **************************************** //
  // Public methods
  // **************************************** //
  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      throw new Error("BusHelper already initialized");
    }

    try {
      this._objectProxy = await this._dbus.getProxyObject(this._serviceName, this._objectName);
      this._interfaceProxy = await this._objectProxy.getInterface(this._interfaceName);

      if (this._options.useProps) {
        this._propsProxy = await this._objectProxy.getInterface("org.freedesktop.DBus.Properties");
      }

      if (this._options.useProps && this._options.usePropsEvents) {
        this._propsProxy?.addListener("PropertiesChanged", this._onPropertiesChanged);
      }

      this._isInitialized = true;
    } catch (e) {
      // TODO: Clear out proxy objects and interfaces
      this._assertDisconnected(e);
    }
  }

  public dispose(): void {
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

    // Remove event handlers we attached to the proxy objects
    if (this._propsProxy) {
      // Remove all listeners, including any that might be attached from `waitPropChange`
      this._propsProxy.removeAllListeners();
    }

    this._objectProxy = undefined;
    this._interfaceProxy = undefined;
    this._propsProxy = undefined;
  }

  public async props(): Promise<Record<string, unknown>> {
    this._assertIsInitialized();

    if (!this._options.useProps) {
      throw new Error("props not available");
    }

    const props: Record<string, unknown> = {};
    try {
      const rawProps: Record<string, Variant> = await this._propsProxy!.GetAll(this._interfaceName);
      for (const propKey in rawProps) {
        if (Object.prototype.hasOwnProperty.call(rawProps, propKey)) {
          props[propKey] = rawProps[propKey].value;
        }
      }
    } catch (e) {
      this._assertDisconnected(e);
    }

    return props;
  }

  public async prop(propName: string): Promise<any> {
    this._assertIsInitialized();

    if (!this._options.useProps) {
      throw new Error("props not available");
    }

    let result: any;
    try {
      const rawProp: Variant = await this._propsProxy!.Get(this._interfaceName, propName);
      result = rawProp.value;
    } catch (e) {
      this._assertDisconnected(e);
    }

    return result;
  }

  public async set(propName: string, value: Variant): Promise<void> {
    this._assertIsInitialized();

    if (!this._options.useProps) {
      throw new Error("props not available");
    }

    try {
      await this._propsProxy!.Set(this._interfaceName, propName, value);
    } catch (e) {
      this._assertDisconnected(e);
    }
  }

  public async waitPropChange(propName: string): Promise<void> {
    this._assertIsInitialized();

    // Force refresh
    // @ts-expect-error
    await this._objectProxy?._init();

    return new Promise((resolve, reject) => {
      const cb = (interfaceName: string, changedProps: Record<string, Variant>, invalidated: boolean): void => {
        // console.log(
        //   `${this._serviceName}/${this._interfaceName} waitPropChange(${propName}), interfaceName=${interfaceName}, changedProps=%o`,
        //   changedProps,
        // );

        if (this._isInitialized) {
          if (!(interfaceName === this._interfaceName && propName in changedProps)) {
            return;
          }
          this._propsProxy!.removeListener("PropertiesChanged", cb);

          // Return result and unblock wait
          resolve(changedProps[propName].value);
        } else {
          this._propsProxy!.removeListener("PropertiesChanged", cb);
          reject(new Error("BusHelper was disposed"));
        }
      };

      // Add listener
      this._propsProxy!.addListener("PropertiesChanged", cb);
    });
  }

  public async getChildren(): Promise<Array<string>> {
    this._assertIsInitialized();

    // Force refresh
    // @ts-expect-error
    await this._objectProxy?._init();

    let result: Array<string> = [];

    try {
      result = BusHelper.buildChildren(this._objectName, this._objectProxy!.nodes);
    } catch (e) {
      this._assertDisconnected(e);
    }

    return result;
  }

  public async callMethod(methodName: string, ...args: any): Promise<any> {
    this._assertIsInitialized();

    let result: any;

    try {
      result = this._interfaceProxy![methodName](...args);
    } catch (e) {
      this._assertDisconnected(e);
    }

    return result;
  }

  // **************************************** //
  // Private methods
  // **************************************** //
  private _onPropertiesChanged(interfaceName: string, changedProps: Record<string, Variant>, invalidated: boolean): void {
    if (interfaceName === this._interfaceName) {
      try {
        this.emit("properties-changed", changedProps);
      } catch (e) {
        console.error(`Error during "properties-changed" emit: ${e}`);
      }
    }
  }

  private _assertIsInitialized(): void {
    if (!this._isInitialized) {
      throw new Error("BusHelper not initialized");
    }
  }

  private _assertDisconnected(e: Error): void {
    console.error(`BusHelper: ${e}`);
    if (e.message.includes("Not connected")) {
      this.dispose();
    }

    throw e;
  }
}
